# open-api-http-client-generator

A tool to generate HTTP client code from OpenAPI specifications using Deno and Yellicode.

## Getting Started

To set up the project, simply run:

```sh
deno install
```

This will install all dependencies as specified in `deno.json` and `deno.lock`.

## Example

Here’s how you can use the generator in your own code:

```ts
import {ApiClient} from "open-api-http-client-generator";
const apiClient = await ApiClient.generateFrom({
  apiName: "projectClient",
  clientFilePath: "apiClient/",
  url:
    "myprojectsOpenApiSpecUrl",
});
apiClient.writeApiClient();
```

This will generate a typed HTTP client in the `./apiClient` directory based on your OpenAPI spec.

## License

MIT