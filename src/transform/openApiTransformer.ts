import { camelCase, pascalCase } from "https://deno.land/x/case@2.2.0/mod.ts";
import ky from "npm:ky";
import openapiTS, { astToString } from "npm:openapi-typescript";
import {
  InterfaceDeclaration,
  Node,
  Project,
  ResolutionHosts,
  SourceFile,
  ts,
  Type,
} from "jsr:@ts-morph/ts-morph@26.0.0";

import { TextWriter } from "npm:@yellicode/core";
import { Generator, OutputMode } from "npm:@yellicode/templating";
import {
  FunctionDefinition,
  InterfaceDefinition,
  ParameterDefinition,
  TypeScriptWriter,
} from "npm:@yellicode/typescript";

const getImportInfo = (fileName:string, importExtension:string, importedMethods:string[] = [], exportedMethods:string[]= [])  => {
  return {
    name: fileName,
    relativePathWithFileExtension: `./${fileName}${importExtension}`,
    relativePath: `./${fileName}`,
    pathWithFileExtension: `${fileName}${importExtension}`,
    pathFromWorkspace: `${import.meta.dirname}/${fileName}${importExtension}`,
    path: fileName,
    importedMethods,
    exportMethodsExpression: exportedMethods.length ? `export { ${exportedMethods.join(", ")} } from "./${fileName}${importExtension}"` : "",
  }
}

const httpClientWrapperInfo = {
  templatePath: getImportInfo("apiClientTemplate",".ts"),
  generatedImportPath: getImportInfo("httpClient",".ts", ["httpClient"], [ "initApiClient"]),
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

type OpenIdPathInfo = {
  parameters: {
    name: string;
    in: "path" | "header";
  }[];
  operationId: string;
  pathStr: string;
};

export class ApiClient extends OneToManyWriteElement {
  static API_TEMP_FILE_NAME = "temp.ts";
  static async generateFrom(
    { url, apiName, clientFilePath }: {
      url: string;
      apiName: string;
      clientFilePath: string;
    },
  ):Promise<ApiClient> {
    const openApiJson = await ky.get<
      {
        paths: Record<
          string,
          Record<
            string,
            {
              operationId: string;
              parameters?: [{ name: string; in: "path" | "header" }];
            }
          >
        >;
      }
    >(url).json();

    const pathAndRequestMethodToOperationNameMap = new Map(
      Object.entries(openApiJson.paths).flatMap(([path, data]) => {
        return Object.entries(data).map<{ mapData: [string, OpenIdPathInfo] }>(
          ([method, opeationData]) => {
            const objKey = `${path}${method}`;
            const parameters = (opeationData.parameters || []).filter((data) =>
              data.in === "path"
            );
            const operationId = opeationData.operationId;

            const objData = { parameters, operationId, pathStr: path };
            return { mapData: [objKey, objData] };
          },
        );
      }).map((data) => (data.mapData)),
    );

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
      clientFilePath,
      project,
      workspace,
      pathAndRequestMethodToOperationNameMap,
    );
  }

  private tempFile: SourceFile;
  private paths: InterfaceDeclaration;
  private operations: InterfaceDeclaration;

  constructor(
    private clientName: string,
    private clientFilePath: string,
    private tempOpenApiProj: Project,
    workspace: Project,
    pathAndRequestMethodToOperationNameMap: Map<string, OpenIdPathInfo>,
  ) {
    super(
      [],
    );

    this.tempFile = this.tempOpenApiProj.getSourceFileOrThrow(
      ApiClient.API_TEMP_FILE_NAME,
    );
    this.paths = this.tempFile.getInterfaceOrThrow("paths");
    this.operations = this.tempFile.getInterfaceOrThrow("operations");
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
              ),
            ];
          }
          return [];
        },
      ),
    );
  }

  writeApiClient() {
    Generator.generate(
      {
        outputFile: `./${this.clientFilePath}${this.clientName}.ts`,
        outputMode: OutputMode.Overwrite,
      },
      (output: TextWriter) => {
        const ts = new TypeScriptWriter(output);
        ts.writeImports(httpClientWrapperInfo.generatedImportPath.relativePathWithFileExtension,httpClientWrapperInfo.generatedImportPath.importedMethods);
        ts.writeLine(httpClientWrapperInfo.generatedImportPath.exportMethodsExpression);
        this.write(ts);
        Deno.copyFileSync(httpClientWrapperInfo.templatePath.pathFromWorkspace, `${Deno.cwd()}/${this.clientFilePath}${httpClientWrapperInfo.generatedImportPath.pathWithFileExtension}`);
      })
  }
}

type PathData = {
  pathType: Type<ts.Type>;
  pathData: OpenIdPathInfo;
};

class PathDef extends OneToManyWriteElement {
  constructor(
    pathStr: string,
    path: Type<ts.Type>,
    pathAndRequestMethodToOperationNameMap: Map<string, OpenIdPathInfo>,
  ) {
    super(restMethods.flatMap((methodStr) => {
      const methodType = path.getProperty(methodStr)?.getValueDeclaration()
        ?.getType();
      const pathData = pathAndRequestMethodToOperationNameMap.get(
        `${pathStr}${methodStr}`,
      );
      if (!methodType || methodType?.isNever() || !pathData) {
        return [];
      }
      return [
        new ApiMethod(
          pathStr,
          pathData.operationId,
          methodType,
          methodStr,
        ),
      ];
    }));
  }
}

class ApiMethod {
  private body: Body;
  private response: Response;
  private path: Path;
  constructor(
    private pathStr: string,
    private methodName: string,
    private requestInfo: Type<ts.Type>,
    private apiMethod: string,
  ) {
    const requestBodyType = tunnel(
      requestInfo,
      "requestBody.content.application/json",
    );
    const responseBodyType = tunnel(
      requestInfo,
      "responses",
    )?.getProperties().map((prop) =>
      tunnel(prop.getValueDeclaration()?.getType(), "content.application/json")
    ).find((t) => !!t);

    const pathType = tunnel(requestInfo, "parameters.path");
    this.response = new Response(methodName, responseBodyType);

    this.path = new Path(pathStr, methodName, pathType);

    this.body = new Body(methodName, requestBodyType);
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

class ElementWithType {
  protected yelliType?: InterfaceDefinition;

  constructor(private name: string, private type?: Type<ts.Type>) {
    this.yelliType = type && {
      name: `${name}`,
      export: true,
      properties: type!!.getProperties()!!.map((prop) => ({
        typeName: prop.getValueDeclaration()!!.getType().getText(),
        name: prop.getName(),
        isOptional: prop.isOptional(),
      })),
    };
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

class Response extends ElementWithType {
  constructor(
    private apiMethodName: string,
    private responseType?: Type<ts.Type>,
  ) {
    super(pascalCase(`${apiMethodName}Response`), responseType);
  }
}

class Body extends ElementWithType {
  constructor(
    private apiMethodName: string,
    private bodyType?: Type<ts.Type>,
  ) {
    super(pascalCase(`${apiMethodName}Body`), bodyType);
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
