import type { ValidatorModule } from "./types";
import { destinationsValidator } from "./destinations";
import { destinationDetailsValidator } from "./destination-details";
import { collectionsValidator } from "./collections";
import { relationshipsValidator } from "./relationships";
import { imagesValidator } from "./images";
import { searchValidator } from "./search";
import { linksValidator } from "./links";

// Explicit execution topology order
export const validators: ValidatorModule[] = [
  destinationsValidator,
  destinationDetailsValidator,
  collectionsValidator,
  relationshipsValidator,
  imagesValidator,
  searchValidator,
  linksValidator,
];
