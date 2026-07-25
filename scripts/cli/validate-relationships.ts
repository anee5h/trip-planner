import { createValidationContext } from "../catalog/loader";
import { relationshipsValidator } from "../validators/relationships";

async function main() {
  const context = await createValidationContext();
  const res = await relationshipsValidator.validate(context);
  console.log(JSON.stringify(res, null, 2));
  if (!res.passed) process.exit(1);
}

main();
