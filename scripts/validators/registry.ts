import type { ValidatorModule } from "./types";
import { destinationsValidator } from "./destinations";
import { collectionsValidator } from "./collections";
import { relationshipsValidator } from "./relationships";
import { imagesValidator } from "./images";
import { searchValidator } from "./search";
import { linksValidator } from "./links";

// Explicit execution topology order
export const validators: ValidatorModule[] = [
  destinationsValidator,
  collectionsValidator,
  relationshipsValidator,
  imagesValidator,
  searchValidator,
  linksValidator,
];
