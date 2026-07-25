import { createValidationContext } from "../catalog/loader";
import { collectionsValidator } from "../validators/collections";

async function main() {
  const context = await createValidationContext();
  const res = await collectionsValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
