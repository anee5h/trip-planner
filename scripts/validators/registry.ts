import type { ValidatorModule } from "./types";
import { destinationsValidator } from "./destinations";
import { destinationDetailsValidator } from "./destination-details";
import { placesValidator } from "./places";
import { collectionsValidator } from "./collections";
import { relationshipsValidator } from "./relationships";
import { imagesValidator } from "./images";
import { searchValidator } from "./search";
import { linksValidator } from "./links";
import { ratingsValidator } from "./ratings";

// Explicit execution topology order
export const validators: ValidatorModule[] = [
  destinationsValidator,
  destinationDetailsValidator,
  placesValidator,
  collectionsValidator,
  relationshipsValidator,
  imagesValidator,
  searchValidator,
  linksValidator,
  ratingsValidator,
];
