export const slugify = (input, fallback = "item") => {
  const base = String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || fallback;
};

export const uniqueSlug = async (Model, base, scope = {}) => {
  let slug = base;
  let n = 1;
  while (await Model.exists({ ...scope, slug })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
};
