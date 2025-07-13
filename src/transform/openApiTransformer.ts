import { camelCase, pascalCase } from "x/case";
import ky from "ky";
import openapiTS, { astToString } from "openapi-typescript";
import {
  InterfaceDeclaration,
  Node,
  Project,
  ResolutionHosts,
  SourceFile,
  ts,
  Type,
} from "ts-morph";

import { TextWriter } from "@yellicode/core";
import { Generator, OutputMode } from "@yellicode/templating";
import {
  FunctionDefinition,
  InterfaceDefinition,
  ParameterDefinition,
  TypeScriptWriter,
} from "@yellicode/typescript";
import { getDirname } from "cross-dirname";
import { clientString } from "./clientString.ts";
import { isAbsolute, join, normalize } from "node:path";
import { SimplifyDeep } from "type-fest";
import { OpenAPIV3 } from "openapi-types";

function randomString(length: number): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}

const workspacePath = Deno.cwd();
const FILE_PATH_LOC = getDirname();
const getImportInfo = (
  fileName: string,
  importExtension: string,
  importedMethods: string[] = [],
  exportedMethods: string[] = [],
) => {
  return {
    name: fileName,
    relativePathWithFileExtension: `./${fileName}${importExtension}`,
    relativePath: `./${fileName}`,
    pathWithFileExtension: `${fileName}${importExtension}`,
    pathFromWorkspace: `${FILE_PATH_LOC}/${fileName}${importExtension}`,
    path: fileName,
    importedMethods,
    exportMethodsExpression: exportedMethods.length
      ? `export { ${
        exportedMethods.join(", ")
      } } from "./${fileName}${importExtension}"`
      : "",
  };
};

const httpClientWrapperInfo = {
  templatePath: getImportInfo("apiClientTemplate", ".ts"),
  generatedImportPath: getImportInfo("httpClient", ".ts", ["httpClient"], [
    "initApiClient",
  ]),
};

function attemptMethodNameFromDescription(input: string): string {
  const maxLength = 30;
  const trimmedString = input.replace(/[^a-zA-Z]/g, "").substring(0, maxLength);
  return camelCase(
    trimmedString.substring(
      0,
      Math.min(trimmedString.length, trimmedString.lastIndexOf(" ")),
    ),
  );
}

const tunnel = (
  s: Type<ts.Type> | undefined,
  field: string,
): Type<ts.Type> | undefined => {
  const fields = field.split(".").reverse();
  const currentField = fields.pop();
  const newFields = fields.reverse().join(".");

  const newType = s?.getProperty(currentField!!)?.getValueDeclaration()
    ?.getType();

  if (newFields.length) {
    return tunnel(newType, newFields);
  }
  return newType;
};

type OperationObject = OpenAPIV3.OperationObject<{}>;

const tunnelValue = (
  s: Node<ts.Node> | undefined,
  field: string,
): Node<ts.Node> | undefined => {
  const fields = field.split(".").reverse();
  const currentField = fields.pop();
  const newFields = fields.reverse().join(".");

  const newType = s?.getType()?.getProperty(currentField!!)
    ?.getValueDeclaration();

  if (newFields.length) {
    return tunnelValue(newType, newFields);
  }
  return newType;
};

abstract class BaseWriteElement {
  public abstract write(tw: TypeScriptWriter): void;
}

class OneToManyWriteElement extends BaseWriteElement {
  constructor(private writableElements: BaseWriteElement[]) {
    super();
  }

  protected addToWritableElements(element: BaseWriteElement[]) {
    this.writableElements.push(...element);
  }

  public override write(tw: TypeScriptWriter): void {
    this.writableElements.forEach((e) => e.write(tw));
  }
}

function getAbsolutePath(filePath: string): string {
  const cwd = Deno.cwd();
  // If already absolute, just normalize
  if (isAbsolute(filePath)) {
    return normalize(filePath);
  }
  // Otherwise, join with cwd and normalize
  return normalize(join(cwd, filePath));
}

const restMethods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

export const nameGeneratorDefault = (
  data: OpenAPIV3.OperationObject<any>,
): string => data.operationId || attemptMethodNameFromDescription(data.summary);

type GeneralOptions = {
  apiName: string;
  clientFilePath: string;
};

type MethodData = {
  methodName: string;
  methodJson: OpenAPIV3.OperationObject<{}>;
  pathStr: string;
};

export type BodyTransformProperty = {
  name: string;
  typeName: string;
  isOptional: boolean;
};

type BodyTransformFunc = (
  info: {
    pathStr: string;
    methodNode: Type<ts.Type>;
    methodJson: OpenAPIV3.OperationObject<any>;
  },
) => BodyTransformProperty[];
type MethodNameExtractor = (
  info: {
    pathStr: string;
    methodJson: OpenAPIV3.OperationObject<any>;
    inUseMethodsNames: string[];
  },
) => string;
type TransformerOptions = {
  requestBodyTransform?: BodyTransformFunc;
  responseBodyTransform?: BodyTransformFunc;
  methodNameExtractor?: MethodNameExtractor;
};

type Transformers = Required<TransformerOptions>;

export const generatePlaceholderBody = () => [{
  typeName: "[x :any]:any",
  name: "unknownBody" + randomString(4),
  isOptional: false,
}];

const defaultTransformerOptions: Transformers = {
  requestBodyTransform: (info) => {
    const { methodNode } = info;
    const bodyType = tunnel(
      methodNode,
      "requestBody.content.application/json",
    );
    if (!bodyType || !bodyType?.getProperties()) {
      return generatePlaceholderBody();
    }
    return bodyType.getProperties().map((prop) => ({
      typeName: prop.getValueDeclaration()?.getType().getText() || "unknown",
      name: prop.getName(),
      isOptional: prop.isOptional(),
    }));
  },
  responseBodyTransform: (info) => {
    const { methodNode } = info;

    const bodyType =  tunnel(
      methodNode,
      "responses",
    )?.getProperties().map((prop) =>
      tunnel(prop.getValueDeclaration()?.getType(), "content.application/json")
    ).find((t) => !!t);

    if (!bodyType || !bodyType?.getProperties()) {
      return generatePlaceholderBody();
    }
    return bodyType.getProperties().map((prop) => ({
      typeName: prop.getValueDeclaration()?.getType().getText() || "unknown",
      name: prop.getName(),
      isOptional: prop.isOptional(),
    }));
  },
  methodNameExtractor: (info) => {
    const { methodJson } = info;
    return methodJson.operationId ||
      attemptMethodNameFromDescription(methodJson.summary);
  },
};

type FileOptions = {
  filePath: string;
};

type UrlOptions = {
  url: string;
};
type OptionsWithFilePath = GeneralOptions & FileOptions & {
  transformerOptions?: TransformerOptions;
};
type OptionsWithUrl = GeneralOptions & UrlOptions & {
  transformerOptions?: TransformerOptions;
};
type Options = OptionsWithFilePath | OptionsWithUrl;

type MethodInfoMap = Map<string, MethodData>;

type BaseUrlData = {
    baseUrl: string;
    baseUrlName: string;
}

export class ApiClient extends OneToManyWriteElement {
  static API_TEMP_FILE_NAME = "temp.ts";
  private static inUseMethodNames: string[] = [];
  static async generateFrom(
    options: Options,
  ): Promise<ApiClient> {
    const {
      apiName,
      clientFilePath,
      transformerOptions: passedTransformerOps = defaultTransformerOptions,
    } = options;
    const transformerOptions = {
      ...defaultTransformerOptions,
      ...passedTransformerOps,
    };
    const openApiJson = "url" in options
      ? await ky.get<
        OpenAPIV3.Document<{}>
      >(options.url).json()
      : JSON.parse(
        Deno.readTextFileSync(getAbsolutePath(options.filePath!)),
      ) as OpenAPIV3.Document<{}>;

      const urlNameMap = new Map<string, boolean>()
     const baseUrls = (openApiJson.servers||[]).map(server => {

      const baseUrl = Object.entries(server.variables||{}).reduce<string>(
        (url: string, [urlVariable, value]) => {
          return url.replace(`{${urlVariable}}`, value.default);
        },
        `${server.url}`
      );
      let baseUrlName = server.description || "defaultUrl"
      if(urlNameMap.has(baseUrlName)){
        baseUrlName+=randomString(4)
      }
      urlNameMap.set(baseUrlName, true)
      return {baseUrl, baseUrlName}
     })
    const pathMethods: (MethodData & { key: string })[] = Object.entries(
      openApiJson.paths,
    ).flatMap((data) => {
      const [pathStr, pathObj] = data;
      if (!pathObj) {
        return [];
      }
      const ttt = restMethods.flatMap((r) => {
        const method = r as keyof typeof pathObj;
        if (!pathObj || !pathObj[method]) {
          return [];
        }
        return [{
          methodJson: pathObj[method] as OperationObject,
          methodType: r,
          pathStr,
        }];
      }).map((data) => {
        const methodName = transformerOptions.methodNameExtractor({
          pathStr: data.pathStr,
          methodJson: data.methodJson,
          inUseMethodsNames: [...this.inUseMethodNames],
        });
        this.inUseMethodNames.push(methodName);
        return {
          methodName,
          pathStr: data.pathStr,
          methodJson: data.methodJson,
          key: pathStr + data.methodType,
        };
      });
      return ttt;
    });
    const methodInfoMap = new Map<string, MethodData>(pathMethods.map((m) => {
      const { key, ...rest } = m;
      return [key, rest];
    }));

    const ast = await openapiTS(
      JSON.stringify(openApiJson),
    );
    const contents = astToString(ast);

    const project = new Project();
    const workspace = new Project({
      resolutionHost: ResolutionHosts.deno,
    });
    project.createSourceFile(this.API_TEMP_FILE_NAME, contents);

    return new ApiClient(
      apiName,
      baseUrls,
      clientFilePath,
      project,
      workspace,
      methodInfoMap,
      transformerOptions,
    );
  }

  private tempFile: SourceFile;
  private paths: InterfaceDeclaration;

  constructor(
    private clientName: string,
    private baseUrlData: BaseUrlData[],
    private clientFilePath: string,
    private tempOpenApiProj: Project,
    workspace: Project,
    pathAndRequestMethodToOperationNameMap: MethodInfoMap,
    transformers: Transformers,
  ) {
    super(
      [],
    );

    this.tempFile = this.tempOpenApiProj.getSourceFileOrThrow(
      ApiClient.API_TEMP_FILE_NAME,
    );
    this.paths = this.tempFile.getInterfaceOrThrow("paths");
    this.addToWritableElements(
      this.paths.getType().getProperties().flatMap(
        (prop) => {
          const valueDecl = prop.getValueDeclaration();
          if (valueDecl) {
            return [
              new PathDef(
                valueDecl.getSymbol()!!.getName(),
                valueDecl.getType(),
                pathAndRequestMethodToOperationNameMap,
                transformers,
              ),
            ];
          }
          return [];
        },
      ),
    );
  }

  writeApiClient() {
    Generator.generate({
      outputFile:
        `./${this.clientFilePath}${httpClientWrapperInfo.generatedImportPath.name}.ts`,
      outputMode: OutputMode.Overwrite,
    }, (output: TextWriter) => {
      const ts = new TypeScriptWriter(output);
      ts.write(clientString);
    });
    Generator.generate(
      {
        outputFile: `./${this.clientFilePath}${this.clientName}.ts`,
        outputMode: OutputMode.Overwrite,
      },
      (output: TextWriter) => {
        const ts = new TypeScriptWriter(output);
        ts.writeImports(
          httpClientWrapperInfo.generatedImportPath
            .relativePathWithFileExtension,
          httpClientWrapperInfo.generatedImportPath.importedMethods,
        );
        ts.writeLine(
          httpClientWrapperInfo.generatedImportPath.exportMethodsExpression,
        );
        this.baseUrlData.forEach(baseUrlData => {
          ts.writeLine(`export const ${baseUrlData.baseUrlName} = "${baseUrlData.baseUrl}"`)
        })
        ts.writeLine()
        this.write(ts);
      },
    );
  }
}

class PathDef extends OneToManyWriteElement {
  constructor(
    pathStr: string,
    path: Type<ts.Type>,
    pathAndRequestMethodToOperationNameMap: MethodInfoMap,
    transformers: Transformers,
  ) {
    super(restMethods.flatMap((methodStr) => {
      const methodType = path.getProperty(methodStr)?.getValueDeclaration()
        ?.getType();
      const pathData = pathAndRequestMethodToOperationNameMap.get(
        `${pathStr}${methodStr}`,
      );
      // console.log("pathData", pathData);
      if (!methodType || methodType?.isNever() || !pathData) {
        return [];
      }
      return [
        new ApiMethod(
          pathStr,
          pathData,
          methodType,
          methodStr,
          transformers,
        ),
      ];
    }));
  }
}

// function getType(text:string){
//   const project = new Project();
//   const sourceFile = project.createSourceFile("temp.ts", `
//     import {LiteralToPrimitiveDeep} from "type-fest"

//       function ph() {const test = ${JSON.stringify(text)} ; return test}
//       const value = ph();
//       type TypeOfInterest = LiteralToPrimitiveDeep<typeof value>;
//     `);
//   const functionDeclaration = sourceFile.getFunctionOrThrow("ph")
//   const returnType = functionDeclaration.removeReturnType()
//   console.log("returnType", returnType?.getText(), returnType.getS);
//     return returnType
//   if(returnType.isArray()){

//     const newSourceFile = project.createSourceFile("temp2.ts", `
//       type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

// type FlattenUnion<T extends object> = { [K in keyof UnionToIntersection<T>]: UnionToIntersection<T>[K] };
//       function ph() {return ${JSON.stringify(text)}}
//       const value = ph();
//       type TypeOfInterest = FlattenUnion<typeof value>;
//       `);
//       const typeTest = newSourceFile.getTypeAliasOrThrow("TypeOfInterest").getType();
//       console.log("typeTest", typeTest.getText());
//     return typeTest
//   }
//   return returnType;
// }

const dumbTypes = [
  "null",
  "undefined",
  "any",
  "unknown",
  "never",
  "void",
  " Record<string, never>",
];

function isEmptyType(type: Type<ts.Type> | undefined): boolean {
  if (!type) {
    return true;
  }
  return dumbTypes.includes(type.getText());
}

class ApiMethod {
  private body: JsonPayload;
  private response: JsonPayload;
  private path: Path;
  private methodName: string;

  private static methodNameRegistry = new Map<string, boolean>();

  constructor(
    private pathStr: string,
    private pathData: MethodData,
    private requestInfo: Type<ts.Type>,
    private apiMethod: string,
    private transformers: Transformers,
  ) {
    const { methodName: baseMethodName } = pathData;

    const getElementName = (uid = "") => {
      const name = `${baseMethodName}${uid}`;
      if (ApiMethod.methodNameRegistry.has(name)) {
        return getElementName(randomString(4));
      }
      ApiMethod.methodNameRegistry.set(name, true);
      return name;
    };
    this.methodName = getElementName();

    // console.log("requestBodyType", requestBodyType?.getText(), "responseBodyType", responseBodyType?.getText());

    // console.log(requestBodyType?.getText(), exampleRequestData, exampleResponseData)
    const pathType = tunnel(requestInfo, "parameters.path");
    this.response = new JsonPayload(
      pathStr,
      this.methodName,
      pathData.methodJson,
      transformers.responseBodyTransform,
      requestInfo,
    );

    this.path = new Path(pathStr, this.methodName, pathType);
    // console.log(responseBodyType?.getText())
    this.body = new JsonPayload(
      pathStr,
      this.methodName,
      pathData.methodJson,
      transformers.requestBodyTransform,
      requestInfo,
    );
  }

  public write(tw: TypeScriptWriter) {
    this.body.write(tw);
    tw.writeLine();
    this.path.write(tw);
    tw.writeLine();
    this.response.write(tw);
    tw.writeLine();
    this.writeFunction(tw);
  }

  private writeFunction(tw: TypeScriptWriter) {
    const parameters: ParameterDefinition[] = [
      ...this.path.getParameterDefMap(() => this.path.unrolledValue),
      ...this.body.getParameterDefMap(() => "body"),
    ];
    const functionDef: FunctionDefinition = {
      name: "",
      isAsync: false,
      returnTypeName:
        (this.response.exists
          ? this.response.getTypeNameWrappedWithArg("Promise")
          : "Promise<void>") +
        "=>",
      parameters,
    };

    tw.writeConstDeclaration({
      name: camelCase(this.methodName),
      export: true,
      typeName: "",
      initializer: (w) => {
        w.write("async ").writeFunctionBlock(functionDef, (fw) => {
          const args = [
            this.body.exists && "body",
            `method: "${this.apiMethod.toLocaleLowerCase()}"`,
          ].filter((t) => t);
          fw.write(
            `return await httpClient.request(${this.path.stringTemplatePath},${`{${
              args.join(",")
            }}`})`,
          );
        });
      },
    });
  }
}

class ElementWithProperties {
  protected yelliType?: InterfaceDefinition;

  constructor(
    private name: string,
    properties: BodyTransformProperty[],
  ) {
    if (properties.length > 0) {
      this.yelliType = {
        name: `${name}`,
        export: true,
        properties,
      };
    }
  }

  getParameterDef(name: () => string): ParameterDefinition | undefined {
    if (!this.exists) {
      return undefined;
    }
    return { name: name(), typeName: this.yelliType!!.name!! };
  }

  getParameterDefMap(name: () => string): ParameterDefinition[] {
    const def = this.getParameterDef(name);
    return def ? [def] : [];
  }

  protected _exists(): boolean {
    return !!this.yelliType;
  }

  get exists(): boolean {
    return this._exists();
  }

  protected throwIfDoesntExist() {
    if (!this.exists) {
      throw new Error("type does not exist");
    }
  }

  getTypeNameWrappedWithArg(typeArgName: string): string {
    return `${typeArgName}<${this.typeName}>`;
  }

  get typeName(): string {
    this.throwIfDoesntExist();
    return this.yelliType?.name!!;
  }

  public write(tw: TypeScriptWriter) {
    if (!this.exists) {
      return;
    }
    tw.writeInterfaceBlock(this.yelliType!!, (w) => {
      this.yelliType!!.properties?.forEach((prop) => {
        w.writeProperty(prop);
        w.writeLine();
      });
    });
  }
}

export const getBodyPropertiesFromTypeNode = (
  type?: Type<ts.Type>,
): BodyTransformProperty[] => {
  if (!type) {
    return [];
  }
  return type.getProperties().map((prop) => ({
    typeName: prop.getValueDeclaration()!!.getType().getText(),
    name: prop.getName(),
    isOptional: prop.isOptional(),
  }));
};

class ElementWithType extends ElementWithProperties {
  constructor(name: string, type?: Type<ts.Type>) {
    super(
      name,
      type?.getProperties().map((prop) => ({
        typeName: prop.getValueDeclaration()!!.getType().getText(),
        name: prop.getName(),
        isOptional: prop.isOptional(),
      })) || [],
    );
  }
}

class JsonPayload extends ElementWithProperties {
  constructor(
    pathStr: string,
    apiMethodName: string,
    methodJson: any,
    bodytransformer: BodyTransformFunc,
    pathType?: Type<ts.Type>,
  ) {
    super(
      pascalCase(`${apiMethodName}Body`),
      pathType
        ? bodytransformer({ pathStr, methodNode: pathType, methodJson })
        : generatePlaceholderBody(),
    );
  }
}

class Path extends ElementWithType {
  constructor(
    private path: string,
    private apiMethodName: string,
    private pathType?: Type<ts.Type>,
  ) {
    super(pascalCase(`${apiMethodName}Path`), pathType);
  }

  override _exists(): boolean {
    return !!this.pathType?.getProperties().length;
  }

  get stringTemplatePath(): string {
    return "`" + this.path.split("{").join("${").slice(1) + "`";
  }

  get unrolledValue(): string {
    this.throwIfDoesntExist();
    return `{${
      this.pathType!!.getProperties()
        .map(
          (p) => p.getName(),
        ).join(",")
    }}`;
  }
}
