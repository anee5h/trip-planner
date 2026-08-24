import { describe, expect, it } from "vitest";
import {
  getWikimediaSrcSet,
  getWikimediaThumb,
  getWikimediaResponsiveImage,
} from "@/shared/utils/wikimediaImages";

const W = "https://upload.wikimedia.org";
const C = "https://commons.wikimedia.org";

describe("getWikimediaSrcSet", () => {
  it("generates thumb variants for an original JPEG", () => {
    const url = `${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`;
    const srcset = getWikimediaSrcSet(url, [250, 330, 500]);
    expect(srcset).toBe(
      `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/250px-Lake_Saroma.jpg 250w, ` +
        `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/330px-Lake_Saroma.jpg 330w, ` +
        `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/500px-Lake_Saroma.jpg 500w`,
    );
  });

  it("normalizes an already-thumbnailized URL to re-thumb at target widths", () => {
    const url = `${W}/wikipedia/commons/thumb/2/26/Abeno_Harukas_Osaka_Japan01-r.jpg/330px-Abeno_Harukas_Osaka_Japan01-r.jpg`;
    const srcset = getWikimediaSrcSet(url, [250]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/2/26/Abeno_Harukas_Osaka_Japan01-r.jpg/250px-Abeno_Harukas_Osaka_Japan01-r.jpg 250w`,
    );
    // must NOT contain the original 330px segment
    expect(srcset).not.toContain("330px");
  });

  it("normalizes a 1920px already-thumb URL", () => {
    const url = `${W}/wikipedia/commons/thumb/a/ac/Nishiarai_Daishi.jpg/1280px-Nishiarai_Daishi.jpg`;
    const srcset = getWikimediaSrcSet(url, [500, 960]);
    expect(srcset).toBe(
      `${W}/wikipedia/commons/thumb/a/ac/Nishiarai_Daishi.jpg/500px-Nishiarai_Daishi.jpg 500w, ` +
        `${W}/wikipedia/commons/thumb/a/ac/Nishiarai_Daishi.jpg/960px-Nishiarai_Daishi.jpg 960w`,
    );
  });

  it("handles uppercase .JPG extension", () => {
    const url = `${W}/wikipedia/commons/1/14/Flowstones_and_Mushroom_Rocks_inside_Abukuma-do_Cave.JPG`;
    const srcset = getWikimediaSrcSet(url, [250]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/1/14/Flowstones_and_Mushroom_Rocks_inside_Abukuma-do_Cave.JPG/250px-Flowstones_and_Mushroom_Rocks_inside_Abukuma-do_Cave.JPG 250w`,
    );
  });

  it("handles PNG", () => {
    const url = `${W}/wikipedia/commons/6/60/Sotokanda.png`;
    const srcset = getWikimediaSrcSet(url, [250]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/6/60/Sotokanda.png/250px-Sotokanda.png 250w`,
    );
  });

  it("handles JPEG (.jpeg) extension", () => {
    const url = `${W}/wikipedia/commons/4/4a/Odaiba_close_up.jpeg`;
    const srcset = getWikimediaSrcSet(url, [250]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/4/4a/Odaiba_close_up.jpeg/250px-Odaiba_close_up.jpeg 250w`,
    );
  });

  it("generates SVG thumbs as .svg.png (Wikimedia convention)", () => {
    const url = `${W}/wikipedia/commons/1/1a/Map_of_Japan.svg`;
    const srcset = getWikimediaSrcSet(url, [250, 500]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/1/1a/Map_of_Japan.svg/250px-Map_of_Japan.svg.png 250w`,
    );
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/1/1a/Map_of_Japan.svg/500px-Map_of_Japan.svg.png 500w`,
    );
  });

  it("preserves escaped filenames (%28, %2C, %C5%8D) without double-encoding", () => {
    const url = `${W}/wikipedia/commons/thumb/d/d7/Aizuwakamatsu_Castle_ac_%281%29.jpg/1920px-Aizuwakamatsu_Castle_ac_%281%29.jpg`;
    const srcset = getWikimediaSrcSet(url, [330]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/d/d7/Aizuwakamatsu_Castle_ac_%281%29.jpg/330px-Aizuwakamatsu_Castle_ac_%281%29.jpg 330w`,
    );
    // No double-encoding: no %2528
    expect(srcset).not.toContain("%25");
  });

  it("handles a raw-space filename via percent-encoding", () => {
    const url = `${W}/wikipedia/commons/5/5f/File with spaces.jpg`;
    const srcset = getWikimediaSrcSet(url, [250]);
    expect(srcset).toContain(
      `${W}/wikipedia/commons/thumb/5/5f/File%20with%20spaces.jpg/250px-File%20with%20spaces.jpg 250w`,
    );
  });

  it("resolves commons Special:Redirect URLs to upload thumb srcSet", () => {
    const url = `${C}/wiki/Special:Redirect/file/Ameya-yokocho01s5s3200.jpg?width=1600`;
    const srcset = getWikimediaSrcSet(url, [250, 500]);
    expect(srcset).toBe(
      `${C}/wiki/Special:Redirect/file/Ameya-yokocho01s5s3200.jpg?width=250 250w, ` +
        `${C}/wiki/Special:Redirect/file/Ameya-yokocho01s5s3200.jpg?width=500 500w`,
    );
  });

  it("passes through non-Wikimedia URLs (null => caller keeps src)", () => {
    const unsplash =
      "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?auto=format&fit=crop&q=80&w=1200";
    expect(getWikimediaSrcSet(unsplash)).toBeNull();
    const istock = "https://media.istockphoto.com/id/123/photo/x.jpg";
    expect(getWikimediaSrcSet(istock)).toBeNull();
    const seiko = "https://museum.seiko.co.jp/common/img/ogp.jpg";
    expect(getWikimediaSrcSet(seiko)).toBeNull();
  });

  it("returns null for malformed / unparseable URLs", () => {
    expect(getWikimediaSrcSet("")).toBeNull();
    expect(getWikimediaSrcSet("not-a-url")).toBeNull();
    expect(
      getWikimediaSrcSet("https://upload.wikimedia.org/wikipedia/commons/a/ae"),
    ).toBeNull();
    expect(getWikimediaSrcSet("https://example.com/x.jpg")).toBeNull();
    expect(
      getWikimediaSrcSet("https://upload.wikimedia.org/other/path.jpg"),
    ).toBeNull();
  });

  it("defaults widths to [250,330,500,960]", () => {
    const srcset = getWikimediaSrcSet(
      `${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`,
    );
    expect(srcset).toContain("960px-Lake_Saroma.jpg 960w");
    expect(srcset).toContain("250px-Lake_Saroma.jpg 250w");
  });
});

describe("getWikimediaResponsiveImage", () => {
  it("builds one shared mobile/tablet/desktop contract for a Wikimedia hero", () => {
    const url = `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/1280px-Kiyomizu-dera%2C_Kyoto.jpg`;
    const image = getWikimediaResponsiveImage(url);

    expect(image).toEqual({
      src: `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/1280px-Kiyomizu-dera%2C_Kyoto.jpg`,
      srcSet:
        `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/500px-Kiyomizu-dera%2C_Kyoto.jpg 500w, ` +
        `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/960px-Kiyomizu-dera%2C_Kyoto.jpg 960w, ` +
        `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/1280px-Kiyomizu-dera%2C_Kyoto.jpg 1280w`,
      sizes: "100vw",
      sources: [
        {
          media: "(max-width: 767px)",
          srcSet: `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/500px-Kiyomizu-dera%2C_Kyoto.jpg 500w`,
          sizes: "100vw",
        },
        {
          media: "(max-width: 1199px)",
          srcSet: `${W}/wikipedia/commons/thumb/a/ae/Kiyomizu-dera%2C_Kyoto.jpg/960px-Kiyomizu-dera%2C_Kyoto.jpg 960w`,
          sizes: "100vw",
        },
      ],
    });
  });

  it("does not upscale a Wikimedia thumbnail whose source width is known", () => {
    const url = `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/330px-Lake_Saroma.jpg`;
    const image = getWikimediaResponsiveImage(url);

    expect(image.src).toContain("330px-Lake_Saroma.jpg");
    expect(image.srcSet).toBe(
      `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/330px-Lake_Saroma.jpg 330w`,
    );
    expect(image.sources).toEqual([
      {
        media: "(max-width: 767px)",
        srcSet: `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/330px-Lake_Saroma.jpg 330w`,
        sizes: "100vw",
      },
    ]);
  });

  it("passes through non-Wikimedia and malformed hero URLs unchanged", () => {
    const unsplash = "https://images.unsplash.com/photo-1?w=1200";
    expect(getWikimediaResponsiveImage(unsplash)).toEqual({ src: unsplash });
    expect(getWikimediaResponsiveImage("not-a-url")).toEqual({
      src: "not-a-url",
    });
    expect(getWikimediaResponsiveImage("")).toEqual({ src: "" });
  });
});
describe("getWikimediaThumb", () => {
  it("returns a single thumb for an original", () => {
    expect(
      getWikimediaThumb(`${W}/wikipedia/commons/a/ae/Lake_Saroma.jpg`, 500),
    ).toBe(
      `${W}/wikipedia/commons/thumb/a/ae/Lake_Saroma.jpg/500px-Lake_Saroma.jpg`,
    );
  });

  it("normalizes an already-thumb URL", () => {
    expect(
      getWikimediaThumb(
        `${W}/wikipedia/commons/thumb/2/26/Abeno_Harukas_Osaka_Japan01-r.jpg/330px-Abeno_Harukas_Osaka_Japan01-r.jpg`,
        500,
      ),
    ).toBe(
      `${W}/wikipedia/commons/thumb/2/26/Abeno_Harukas_Osaka_Japan01-r.jpg/500px-Abeno_Harukas_Osaka_Japan01-r.jpg`,
    );
  });

  it("returns null for non-Wikimedia", () => {
    expect(
      getWikimediaThumb("https://images.unsplash.com/x.jpg", 640),
    ).toBeNull();
  });
});
