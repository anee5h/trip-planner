import { createValidationContext } from "../catalog/loader";
import { linksValidator } from "../validators/links";

async function main() {
  const context = await createValidationContext();
  const res = await linksValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
