import { createValidationContext } from "../catalog/loader";
import { imagesValidator } from "../validators/images";

async function main() {
  const context = await createValidationContext();
  const res = await imagesValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
