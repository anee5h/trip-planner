import fs from "fs";
import path from "path";
import type { Destination } from "../src/shared/types/destination";

const IMAGE_BY_DESTINATION_ID: Record<string, string> = {
  "cup-noodles-museum-yokohama":
    "https://upload.wikimedia.org/wikipedia/commons/6/6d/Cupnoodles-Museum-Yokohama.jpg",
  "kannai-yokohama":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Kanagawa_prefectural_office02s3200.jpg/1920px-Kanagawa_prefectural_office02s3200.jpg",
  "minato-mirai-yokohama":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Minato_Mirai_In_Blue.jpg/1920px-Minato_Mirai_In_Blue.jpg",
  "shin-yokohama-ramen-museum":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Shinyokohama_ramen_museum.jpg/1920px-Shinyokohama_ramen_museum.jpg",
  "soji-ji-yokohama":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/S%C5%8Djiji_Sanshokaku_2009.jpg/1920px-S%C5%8Djiji_Sanshokaku_2009.jpg",
  "yamashita-park-yokohama":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Parque_Yamashita_2.JPG/1920px-Parque_Yamashita_2.JPG",
  "yokohama-red-brick-warehouse":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/92/Akarenga_Yokohama_2012.jpg/1920px-Akarenga_Yokohama_2012.jpg",
  "yokohama-chinatown":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Yokohama_Chinatown_signage_2015.jpg/1920px-Yokohama_Chinatown_signage_2015.jpg",
  "yokohama-cosmo-world":
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Yokohama_Cosmoworld_2022.jpg/1920px-Yokohama_Cosmoworld_2022.jpg",
  "kirin-beer-yokohama-factory":
    "https://upload.wikimedia.org/wikipedia/commons/8/80/Kirin_beer_yokohama_factory_kanagawa_2009.JPG",
};

const indexPath = path.join(
  process.cwd(),
  "src/shared/data/destinations-index.json",
);
const destinations = JSON.parse(
  fs.readFileSync(indexPath, "utf-8"),
) as Destination[];
for (const [id, heroImage] of Object.entries(IMAGE_BY_DESTINATION_ID)) {
  const destination = destinations.find((item) => item.id === id);
  if (!destination) throw new Error(`Unknown Yokohama destination: ${id}`);
  destination.heroImage = heroImage;
  destination.imageNeedsReview = false;
  destination.notes = destination.notes.replace(
    / Image placeholder: replace in QA before editorial approval\./,
    "",
  );
}
fs.writeFileSync(indexPath, `${JSON.stringify(destinations, null, 2)}\n`);
