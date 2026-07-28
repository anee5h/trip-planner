import { createValidationContext } from "../catalog/loader";
import { placesValidator } from "../validators/places";

async function main() {
  const result = await placesValidator.validate(
    await createValidationContext(),
  );
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}

main();
