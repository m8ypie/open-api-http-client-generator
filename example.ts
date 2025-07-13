import {
  ApiClient,
  BodyTransformProperty,
  getBodyPropertiesFromTypeNode,
} from "open-api-http-client-generator";
import { camelCase } from "x/case";
import { deepmerge } from "@fastify/deepmerge";
import { Project } from "ts-morph";
import { transformResponsesObject } from "openapi-typescript";
import { generatePlaceholderBody } from "./main.ts";
import { atomizeChangeset, diff } from "json-diff-ts";

const merge = deepmerge();

const mergeObjects = (arr: Record<any, any>[]) => {
  return arr.reduce((obj1, obj2) => {
    return merge(obj1, obj2);
  }, []);
};

const generaliseArray = (arr: Record<any, any>[]): any[] => {
  return [generalise(mergeObjects(arr))];
};

const areObjectsAreMeaningfullyDifferent = (
  obj: any,
  mergedObj: any,
) => {
  const changeSet = atomizeChangeset(
    diff(obj, mergeObjects, { treatTypeChangeAsReplace: false }),
  );
  const hasDestructiveDif = changeSet.some((s) => {
    const isUpdate = s.type === "UPDATE";
    const valuesAreNotNull = !!s.oldValue && !!s.value;
    const typesAreDifferent = typeof s.oldValue !== typeof s.value;
    return isUpdate && valuesAreNotNull && typesAreDifferent;
  });
  return hasDestructiveDif;
};

const generaliseObjIfApplicable = (obj: Record<string, any>): any => {
  const keys = Object.keys(obj);
  let valuesAredeSame = true
  const values = Object.values(obj).reduce((obj1, obj2) => {
    valuesAredeSame = valuesAredeSame && !areObjectsAreMeaningfullyDifferent(obj1, obj2)
    return mergeObjects([obj1, obj2])
  }, {})

  if (!valuesAredeSame) {
    return Object.entries(obj).reduce((o, row) => {
      return { ...o, [row[0]]: generalise(row[1]) };
    }, {});
  }
  return { [keys[0]]: values };
};

const isKeyValueObject = (val: unknown): val is Record<string, unknown> => {
  return typeof val === "object" && val !== null && !Array.isArray(val);
};

const generalise = (element: any): any => {
  if (Array.isArray(element)) {
    return generaliseArray(element);
  }
  if (isKeyValueObject(element)) {
    return generaliseObjIfApplicable(element);
  }
  return element;
};
const test = {
  "status": "success",
  "message": "See all in lists.",
  "lists": {
    "145": {
      "id": "145",
      "user_id": "1",
      "name": "Proclomation of Sands",
      "description": "",
      "status": "1",
      "date_created": "2015-06-08 05:21:08",
      "last_updated": "2015-06-08 05:21:08",
      "public": "1",
      "hash": "aJvay",
    },
    "825": {
      "id": "825",
      "user_id": "1",
      "name": "Modern Esper",
      "description": "",
      "status": "1",
      "date_created": "2016-01-10 18:58:53",
      "last_updated": "2016-01-10 18:58:53",
      "public": "0",
      "hash": null,
    },
    "828": {
      "id": "828",
      "user_id": "1",
      "name": "Polymorph",
      "description": "",
      "status": "1",
      "date_created": "2016-01-10 19:03:05",
      "last_updated": "2016-01-10 19:03:05",
      "public": "1",
      "hash": "aJvpC",
    },
    "835": {
      "id": "835",
      "user_id": "1",
      "name": "RDW San Diego",
      "description": "",
      "status": "1",
      "date_created": "2016-01-11 00:02:45",
      "last_updated": "2016-01-11 00:02:45",
      "public": "0",
      "hash": null,
    },
    "842": {
      "id": "842",
      "user_id": "1",
      "name": "97059-MODO.txt Cheap",
      "description": "",
      "status": "1",
      "date_created": "2016-01-11 03:56:52",
      "last_updated": "2016-01-11 03:56:52",
      "public": "1",
      "hash": "gOBkq",
    },
    "851": {
      "id": "851",
      "user_id": "1",
      "name": "BUG Delver Legacy",
      "description": "",
      "status": "1",
      "date_created": "2016-01-11 06:02:52",
      "last_updated": "2016-01-11 06:02:52",
      "public": "1",
      "hash": "aIVbH",
    },
    "860": {
      "id": "860",
      "user_id": "1",
      "name": "Randy Test",
      "description": "",
      "status": "1",
      "date_created": "2016-01-11 22:35:15",
      "last_updated": "2016-01-11 22:35:15",
      "public": "1",
      "hash": "gER5j",
    },
    "929": {
      "id": "929",
      "user_id": "1",
      "name": "Eldrazi Blue White Control",
      "description": "",
      "status": "1",
      "date_created": "2016-01-16 18:41:52",
      "last_updated": "2016-01-16 18:41:52",
      "public": "1",
      "hash": "aKWB4",
    },
    "1010": {
      "id": "1010",
      "user_id": "1",
      "name": "Modern Esper",
      "description": "",
      "status": "1",
      "date_created": "2016-01-21 04:45:48",
      "last_updated": "2016-01-21 04:45:48",
      "public": "1",
      "hash": "aM7BD",
    },
    "1024": {
      "id": "1024",
      "user_id": "1",
      "name": "Ebay Purchases White Foils",
      "description": "",
      "status": "1",
      "date_created": "2016-01-21 18:13:07",
      "last_updated": "2016-01-21 18:13:07",
      "public": "1",
      "hash": "aMKdM",
    },
    "1317": {
      "id": "1317",
      "user_id": "1",
      "name": "Mill Me Bug",
      "description": "",
      "status": "1",
      "date_created": "2016-02-07 19:43:53",
      "last_updated": "2016-02-07 19:43:53",
      "public": "1",
      "hash": "aTlPE",
    },
    "1364": {
      "id": "1364",
      "user_id": "1",
      "name": "Porphyry Control",
      "description": "",
      "status": "1",
      "date_created": "2016-02-10 02:58:33",
      "last_updated": "2016-02-10 02:58:33",
      "public": "1",
      "hash": "aTLEW",
    },
    "3500": {
      "id": "3500",
      "user_id": "1",
      "name": "bugdelvermodern-11-01-16.dek",
      "description": "",
      "status": "1",
      "date_created": "2016-07-26 19:44:16",
      "last_updated": "2016-07-26 19:44:16",
      "public": "1",
      "hash": "gEQKi",
    },
    "3701": {
      "id": "3701",
      "user_id": "1",
      "name": "Channel Fireball",
      "description": "",
      "status": "1",
      "date_created": "2016-08-19 22:31:30",
      "last_updated": "2016-08-19 22:31:30",
      "public": "1",
      "hash": "basph",
    },
    "3779": {
      "id": "3779",
      "user_id": "1",
      "name": "Modern Burn",
      "description": "",
      "status": "1",
      "date_created": "2016-08-29 22:11:48",
      "last_updated": "2016-08-29 22:11:48",
      "public": "1",
      "hash": "cEoPM",
    },
    "4051": {
      "id": "4051",
      "user_id": "1",
      "name": "PyroThing",
      "description": "",
      "status": "1",
      "date_created": "2016-09-27 19:24:15",
      "last_updated": "2016-09-27 19:24:15",
      "public": "1",
      "hash": "boyCN",
    },
    "4865": {
      "id": "4865",
      "user_id": "1",
      "name": "Shardless BUG",
      "description": "",
      "status": "1",
      "date_created": "2017-01-02 02:04:32",
      "last_updated": "2017-01-02 02:04:32",
      "public": "1",
      "hash": "gEQIm",
    },
    "5175": {
      "id": "5175",
      "user_id": "1",
      "name": "Ninja Bear",
      "description": "",
      "status": "1",
      "date_created": "2017-01-31 07:04:03",
      "last_updated": "2017-01-31 07:04:03",
      "public": "1",
      "hash": "gEQGO",
    },
    "6241": {
      "id": "6241",
      "user_id": "1",
      "name": "Burning Green",
      "description": "",
      "status": "1",
      "date_created": "2017-04-29 22:25:10",
      "last_updated": "2017-04-29 22:25:10",
      "public": "1",
      "hash": "d5QdV",
    },
    "13130": {
      "id": "13130",
      "user_id": "1",
      "name": "magic traders duals",
      "description": "",
      "status": "1",
      "date_created": "2018-12-03 22:35:39",
      "last_updated": "2018-12-03 22:35:39",
      "public": "1",
      "hash": "gTwpf",
    },
    "13959": {
      "id": "13959",
      "user_id": "1",
      "name": "arean test",
      "description": "asdasd",
      "status": "1",
      "date_created": "2019-02-11 03:23:21",
      "last_updated": "2019-02-11 03:23:21",
      "public": "0",
      "hash": null,
    },
    "13960": {
      "id": "13960",
      "user_id": "1",
      "name": "test",
      "description": "",
      "status": "1",
      "date_created": "2019-02-11 03:27:27",
      "last_updated": "2019-02-11 03:27:27",
      "public": "0",
      "hash": null,
    },
    "15348": {
      "id": "15348",
      "user_id": "1",
      "name": "test import",
      "description": "",
      "status": "1",
      "date_created": "2019-05-26 06:10:29",
      "last_updated": "2019-05-26 06:10:29",
      "public": "0",
      "hash": null,
    },
    "23158": {
      "id": "23158",
      "user_id": "1",
      "name": "Special Sealed 2020",
      "description": "",
      "status": "1",
      "date_created": "2021-01-24 04:48:43",
      "last_updated": "2021-01-24 04:48:43",
      "public": "1",
      "hash": "l3XKS",
    },
    "24864": {
      "id": "24864",
      "user_id": "1",
      "name": "snooow",
      "description": "",
      "status": "1",
      "date_created": "2021-05-03 01:36:30",
      "last_updated": "2021-05-03 01:36:30",
      "public": "0",
      "hash": null,
    },
    "25570": {
      "id": "25570",
      "user_id": "1",
      "name": "MH2 Collector Ripped",
      "description": "",
      "status": "1",
      "date_created": "2021-06-19 05:19:53",
      "last_updated": "2021-06-19 05:19:53",
      "public": "1",
      "hash": "luTVm",
    },
    "30952": {
      "id": "30952",
      "user_id": "1",
      "name": "Gaddock Teeg Commander",
      "description":
        "Shutdown deck based around Gaddock teeg prevent spell casting while tutoring swords onto teeg, having teeg swing for commander damage. Other hate bears to shut down competitors.",
      "status": "1",
      "date_created": "2022-09-06 19:32:38",
      "last_updated": "2022-09-06 19:32:38",
      "public": "1",
      "hash": "oViOd",
    },
    "31119": {
      "id": "31119",
      "user_id": "1",
      "name": "united pulls box 1",
      "description": "This was a rough box, ~120 in value, a $140 loss",
      "status": "1",
      "date_created": "2022-09-21 23:59:14",
      "last_updated": "2022-09-21 23:59:14",
      "public": "0",
      "hash": null,
    },
  },
};

console.log(generalise(test));

const project = new Project();

const generateTypeFromInsanceExamples = (obj: any): BodyTransformProperty[] => {
  console.log(obj);
  const file = `function hi(){return ${JSON.stringify(generalise(obj))}}`;
  console.log(file);
  const sourceFile = project.createSourceFile("temp.ts", file);
  const bodyProperties = getBodyPropertiesFromTypeNode(
    sourceFile.getFunction("hi")?.getReturnType(),
  );
  sourceFile.delete();
  return bodyProperties;
};

function isEmptyObject(obj: unknown): boolean {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj) &&
    Object.keys(obj).length === 0;
}

const processTheAnythingSchemaLOL = (
  pathStr: string,
  methodJson: any,
  traverseTheSchemaWithNoConsistency: (methodJson?: any) => any,
): BodyTransformProperty[] => {
  let t: any = "not here";
  try {
    if (!methodJson || isEmptyObject(methodJson)) {
      return [];
    }
    const body = traverseTheSchemaWithNoConsistency(methodJson);
    if (!body) {
      return [];
    }
    t = body;
    return generateTypeFromInsanceExamples(body);
  } catch (err) {
    console.error(pathStr, err, methodJson, t);
    return [];
  }
};
const apiClient = await ApiClient.generateFrom({
  apiName: "echo",
  clientFilePath: "temp/",
  filePath: "./openapi.json",
  transformerOptions: {
    methodNameExtractor: ({ methodJson, inUseMethodsNames }) => {
      const colonSplitMethod = methodJson.summary.includes(":") &&
          methodJson.summary.split(" ").length - 1 > 1
        ? methodJson.summary.split(":")[1]
        : methodJson.summary;
        
        const entireDescFallback = methodJson.summary.replace(":", "")


      const relevantName = inUseMethodsNames.includes(colonSplitMethod) ? colonSplitMethod : entireDescFallback
      return camelCase(relevantName);
    },
    requestBodyTransform: ({ methodJson, pathStr }) =>
      processTheAnythingSchemaLOL(pathStr, methodJson, () => {
        const content = methodJson.content;
        if (!content) return null;
        const responseTypeKey = Object.keys(content)[0];
        const responseType = content[responseTypeKey];
        const example = "example" in responseType
          ? responseType.example
          : responseType.schema.example;
        return typeof example === "string" ? JSON.parse(example) : example;
      }),
    responseBodyTransform: ({ pathStr, methodJson }) =>
      processTheAnythingSchemaLOL(pathStr, methodJson, () => {
        return methodJson.responses["200"].content["application/json"].example;
      }),
  },
});
apiClient.writeApiClient();


const apiClient2 = await ApiClient.generateFrom({
  apiName: "buyDeal",
  clientFilePath: "temp/",
  url:
    "https://developer.ebay.com/api-docs/master/buy/deal/openapi/3/buy_deal_v1_oas3.json",
});
apiClient2.writeApiClient();