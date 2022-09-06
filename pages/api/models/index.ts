import { ModelInfo, UploadForm } from "@customTypes/model";
import { hasRight } from "@libs/server/Authorization";
import prismaClient from "@libs/server/prismaClient";
import { deleteS3Files } from "@libs/server/s3client";
import { extractZipThenSendToS3 } from "@libs/server/ServerFileHandling";
import { Model } from "@prisma/client";
import { randomUUID } from "crypto";
import formidable from "formidable";
import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "next-auth/react";

export const config = {
  api: {
    bodyParser: false,
  },
};

type FormidableResult = {
  err: string;
  fields: formidable.Fields;
  files: formidable.Files;
};

const allowedMethod = ["GET", "POST", "DELETE"];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const token = await getSession({ req });
  if (!allowedMethod.includes(req.method ?? "")) {
    res.status(405).end();
    return;
  }
  if (req.method === "GET") {
    // respone specified model info
    if (req.query.id) {
      const model = await prismaClient.model.findUnique({
        where: { id: req.query.id as string },
      });
      if (!model) {
        res.status(404).end();
        return;
      }
      res.json([makeModelInfo(model)]);
      return;
    } else if (req.query.uploader) {
      // respone specific uploader's models info
      const uploaders =
        typeof req.query.uploader === "string"
          ? [req.query.uploader]
          : req.query.uploader;
      const querys = uploaders.map((uploaderId) => {
        return {
          uploader: {
            id: uploaderId,
          },
        };
      });
      const model = await prismaClient.model.findMany({
        where: {
          OR: querys,
        },
      });
      res.json(makeModelInfos(model));
      return;
    }
    const modelList = await prismaClient.model.findMany({
      orderBy: {
        createdAt: "desc",
      },
    });
    const parsedList = makeModelInfos(modelList);
    res.status(200).json(parsedList);
  } else if (req.method === "POST") {
    // authorize client then upload model. db update return model id.
    const isLogined = !!token;
    if (!isLogined) {
      res.status(401).send("Login first");
      return;
    }
    const user = await prismaClient.user.findUnique({
      where: {
        email: token.user?.email ?? undefined, // if undefined, search nothing
      },
    });
    if (user === null) {
      res.status(401).end();
      return;
    }
    if (
      // if don't have right, reply code 403.
      !hasRight(
        {
          theme: "model",
          method: "create",
        },
        user
      )
    ) {
      res.status(403).json({ ok: false, message: "로그인이 필요합니다." });
      return;
    }

    // upload to s3
    const uuid = randomUUID();
    const formidable = await getFormidableFileFromReq(req);
    const {
      model: modelName,
      thumbnail,
      modelInfo,
      totalSize,
      modelUsdz,
    } = await extractZipThenSendToS3(uuid, formidable).catch((e) => {
      res.status(500).json({ error: `while uploading to storage` });
      console.log(e);
      return {
        model: "",
        modelUsdz: "",
        thumbnail: "",
        modelInfo: {},
        totalSize: 0,
      };
    });
    if (!modelName && !res.writableEnded) {
      res.status(400).json({ error: ".gltf or .glb file is missing" });
      return;
    }
    const form: UploadForm = JSON.parse(formidable.fields.form as string);

    await prismaClient.model
      .create({
        data: {
          id: uuid,
          name: form.name,
          category: form.category,
          tags: form.tag?.split(" ") ?? [],
          description: form.description,
          thumbnail: thumbnail,
          modelFile: modelName,
          userId: user.id,
          modelInfo: JSON.stringify(modelInfo),
          modelSize: totalSize.toString() ?? "",
          modelUsdz,
        },
      })
      .catch((e) => {
        res.status(500).json({ error: "while updating db" });
        deleteS3Files(uuid);
        console.log(e);
        return;
      });
    res
      .setHeader("Location", "/models")
      .status(303)
      .json({ message: "업로드에 성공하였습니다." });
  } else if (req.method === "DELETE") {
    const user = await prismaClient.user.findUnique({
      where: {
        email: token?.user?.email ?? undefined, // if undefined, search nothing
      },
    });
    const modelId = Array.isArray(req.query.id)
      ? req.query.id[0]
      : req.query.id;
    if (!modelId) {
      res.status(400).json({ error: "model id query not found" });
      return;
    }
    const model = await prismaClient.model.findUnique({
      where: {
        id: modelId,
      },
    });
    if (
      !hasRight(
        {
          method: "delete",
          theme: "model",
        },
        user,
        model
      )
    ) {
      res.status(403).end();
      return;
    }
    try {
      deleteS3Files(modelId);
      await prismaClient.model.delete({
        where: {
          id: modelId,
        },
      });
      res.json({ ok: true, message: "delete success!" });
      return;
    } catch (e) {
      res.status(500).json({ ok: false, message: "Failed while deleting." });
      return;
    }
  }
}

// FOR RESPONE TO GET

const makeModelInfo: (model: Model) => ModelInfo = (model) => {
  const thumbnailSrc = model.thumbnail
    ? `/getResource/models/${model.id}/${model.thumbnail}`
    : "";
  const usdzSrc = model.modelUsdz
    ? `/getResource/models/${model.id}/${model.modelUsdz}`
    : "";
  return {
    ...model,
    modelSrc: `/getResource/models/${model.id}/${model.modelFile}`,
    thumbnailSrc,
    usdzSrc,
  };
};

const makeModelInfos: (models: Model[]) => ModelInfo[] = (models) =>
  models.map((model) => makeModelInfo(model));

// FOR RESPONE TO POST

const getFormidableFileFromReq = async (req: NextApiRequest) => {
  return await new Promise<FormidableResult>((res, rej) => {
    const form = formidable({
      multiples: true,
      maxFieldsSize: 100 << 20, // 100MB for zip file
      keepExtensions: true,
    });
    form.parse(req, (err, fields, files) => {
      if (err) return rej(err);
      return res({ err, fields, files });
    });
  });
};
