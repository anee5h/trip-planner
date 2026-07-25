import { createValidationContext } from "../catalog/loader";
import { destinationsValidator } from "../validators/destinations";

async function main() {
  const context = await createValidationContext();
  const res = await destinationsValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
