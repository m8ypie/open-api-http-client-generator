import {ApiClient} from "open-api-http-client-generator";
const apiClient = await ApiClient.generateFrom({
  apiName: "buyDeal",
  clientFilePath: "temp/",
  url:
    "https://developer.ebay.com/api-docs/master/buy/deal/openapi/3/buy_deal_v1_oas3.json",
});
apiClient.writeApiClient();
