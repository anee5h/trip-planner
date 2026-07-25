import { createValidationContext } from "../catalog/loader";
import { searchValidator } from "../validators/search";

async function main() {
  const context = await createValidationContext();
  const res = await searchValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
