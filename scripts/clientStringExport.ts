const re = Deno.readFileSync(Deno.cwd()+"/src/transform/apiClientTemplate.ts");
const decoder = new TextDecoder("utf-8");
const fileString = decoder.decode(re);

Deno.writeTextFileSync(Deno.cwd()+"/src/transform/clientString.ts", `export const clientString = \`${fileString}\``)