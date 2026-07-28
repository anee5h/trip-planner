import { createValidationContext } from "../catalog/loader";
import { destinationDetailsValidator } from "../validators/destination-details";

async function main() {
  const context = await createValidationContext();
  const result = await destinationDetailsValidator.validate(context);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

main();
