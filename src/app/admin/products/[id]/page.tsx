"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "@/components/icons";
import {
  AdminFieldError,
  nestjsApi,
  Product,
  Game,
  Category,
  UpdateProductDto,
  CreateProductForGameDto,
} from "@/lib/nestjs-api";
import {
  ProductVariantsEditor,
  newVariant,
  type VariantForm,
} from "@/components/product-variants-editor";
import {
  ProductOptionsEditor,
  type OptionGroupForm,
} from "@/components/product-options-editor";
import {
  ProductMediaEditor,
  type ProductImageForm,
} from "@/components/product-media-editor";
import { finalizeSlug, normalizeSlugDraft } from "@/lib/slug-input";
import { formatPriceDraft, parsePriceDraft } from "@/lib/price-input";
import { BlogEditor } from "@/components/blog/blog-editor";

type ProductFormData = {
  gameId: string;
  categoryId: string;
  name: string;
  slug: string;
  productType:
    | "currency"
    | "account"
    | "item"
    | "boosting"
    | "service"
    | "subscription"
    | "other";
  price: number;
  compareAtPrice: number;
  currency: string;
  status: "draft" | "published" | "archived";
  isActive: boolean;
  featured: boolean;
  sortOrder: number;
  shortDescription: string;
  description: string;
  requirements: string;
  deliveryInformation: string;
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
  ogImageUrl: string;
  canonicalUrl: string;
};

const empty: ProductFormData = {
  gameId: "",
  categoryId: "",
  name: "",
  slug: "",
  productType: "currency",
  price: 0,
  compareAtPrice: 0,
  currency: "USD",
  status: "draft",
  isActive: false,
  featured: false,
  sortOrder: 0,
  shortDescription: "",
  description: "",
  requirements: "",
  deliveryInformation: "",
  seoTitle: "",
  seoDescription: "",
  seoKeywords: "",
  ogImageUrl: "",
  canonicalUrl: "",
};

const PRODUCT_TYPES = [
  { value: "currency", label: "Currency" },
  { value: "account", label: "Account" },
  { value: "item", label: "Item" },
  { value: "boosting", label: "Boosting" },
  { value: "service", label: "Service" },
  { value: "subscription", label: "Subscription" },
  { value: "other", label: "Other" },
] as const;

export default function ProductEditorPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  const isEditing = productId !== "new";
  const slugTouched = useRef(isEditing);

  const [form, setForm] = useState<ProductFormData>(empty);
  const [variants, setVariants] = useState<VariantForm[]>([
    newVariant("Default", "initial"),
  ]);
  const [optionGroups, setOptionGroups] = useState<OptionGroupForm[]>([]);
  const [images, setImages] = useState<ProductImageForm[]>([]);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [games, setGames] = useState<Game[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEditing);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );
  const [gamesError, setGamesError] = useState(false);
  const [categoriesError, setCategoriesError] = useState(false);

  useEffect(() => {
    loadGames();
    if (isEditing) {
      loadProduct();
    }
  }, [productId]);

  useEffect(() => {
    if (form.gameId) {
      loadCategories();
    }
  }, [form.gameId]);

  async function loadGames() {
    setGamesError(false);
    try {
      const response = await nestjsApi.games.list({
        limit: 100,
        status: "published",
      });
      setGames(response);
    } catch {
      setGames([]);
      setGamesError(true);
    }
  }

  async function loadCategories() {
    setCategoriesError(false);
    try {
      const response = await nestjsApi.categories.list({
        limit: 100,
        gameId: form.gameId,
      });
      setCategories(response);
    } catch {
      setCategories([]);
      setCategoriesError(true);
    }
  }

  async function loadProduct() {
    try {
      const product: Product = await nestjsApi.products.get(productId);
      const productData: ProductFormData = {
        gameId: product.gameId,
        categoryId: product.categoryId,
        name: product.name,
        slug: product.slug,
        productType: product.productType,
        price: Number(product.price),
        compareAtPrice: product.compareAtPrice
          ? Number(product.compareAtPrice)
          : 0,
        currency: product.currency,
        status: product.status as ProductFormData["status"],
        isActive: product.isActive,
        featured: product.featured,
        sortOrder: product.sortOrder,
        shortDescription: product.shortDescription ?? "",
        description: product.description ?? "",
        requirements: product.requirements ?? "",
        deliveryInformation: product.deliveryInformation ?? "",
        seoTitle: product.seoTitle ?? "",
        seoDescription: product.seoDescription ?? "",
        seoKeywords: product.seoKeywords ?? "",
        ogImageUrl: product.ogImageUrl ?? "",
        canonicalUrl: product.canonicalUrl ?? "",
      };
      setForm(productData);
      setVariants(
        product.variants.length
          ? product.variants.map((variant) => ({
              key: variant.id,
              id: variant.id,
              label: variant.label,
              description: variant.description ?? "",
              price: formatPriceDraft(variant.price),
              compareAtPrice: formatPriceDraft(variant.compareAtPrice),
              isActive: variant.isActive,
              optionValueIds: variant.optionValueIds ?? [],
            }))
          : [
              {
                ...newVariant("Default", "legacy-default"),
                price: formatPriceDraft(product.price),
                compareAtPrice: formatPriceDraft(product.compareAtPrice),
              },
            ],
      );
      setOptionGroups(product.optionGroups ?? []);
      setImages(
        product.images.map((image, index) => ({
          key: `saved-${index}`,
          imageUrl: image.imageUrl,
          altText: image.altText ?? "",
        })),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load product");
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  function set<K extends keyof ProductFormData>(
    key: K,
    value: ProductFormData[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeName(value: string) {
    setForm((current) => ({
      ...current,
      name: value,
      slug: slugTouched.current ? current.slug : finalizeSlug(value),
    }));
  }

  function changeSlug(value: string) {
    slugTouched.current = true;
    set("slug", normalizeSlugDraft(value));
  }

  function finishSlug() {
    setForm((current) => ({ ...current, slug: finalizeSlug(current.slug) }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setFieldErrors({});

    const localErrors: Record<string, string> = {};
    if (!form.gameId) localErrors.gameId = "Choose a Game.";
    if (!form.categoryId) localErrors.categoryId = "Choose a Category.";
    if (!form.name.trim()) localErrors.name = "Enter a Product name.";
    if (!variants.length) localErrors.variants = "Add at least one option.";
    const structured = optionGroups.length > 0;
    const seenGroupNames = new Set<string>();
    const valueToGroup = new Map<string, string>();
    optionGroups.forEach((group, groupIndex) => {
      const groupName = group.name.trim().toLocaleLowerCase();
      if (!groupName)
        localErrors[`optionGroups.${groupIndex}.name`] = "Enter a group name.";
      else if (seenGroupNames.has(groupName))
        localErrors[`optionGroups.${groupIndex}.name`] =
          "Group names must be unique.";
      seenGroupNames.add(groupName);
      if (!group.values.length)
        localErrors.optionGroups =
          "Each option group needs at least one value.";
      const seenLabels = new Set<string>();
      group.values.forEach((value, valueIndex) => {
        const label = value.label.trim().toLocaleLowerCase();
        if (!label)
          localErrors[`optionGroups.${groupIndex}.values.${valueIndex}.label`] =
            "Enter a value.";
        else if (seenLabels.has(label))
          localErrors[`optionGroups.${groupIndex}.values.${valueIndex}.label`] =
            "Values must be unique within a group.";
        seenLabels.add(label);
        valueToGroup.set(value.id, group.id);
      });
    });
    const seenCombinations = new Set<string>();
    variants.forEach((variant, index) => {
      if (!structured && !variant.label.trim())
        localErrors[`variants.${index}.label`] = "Enter an option name.";
      const price = parsePriceDraft(variant.price);
      const compareAtPrice = parsePriceDraft(variant.compareAtPrice, true);
      if (!price.ok)
        localErrors[`variants.${index}.price`] = "Enter a valid price.";
      if (!compareAtPrice.ok)
        localErrors[`variants.${index}.compareAtPrice`] =
          "Enter a valid compare-at price or leave it blank.";
      if (structured) {
        const selectedByGroup = optionGroups.map((group) =>
          variant.optionValueIds.filter(
            (id) => valueToGroup.get(id) === group.id,
          ),
        );
        if (
          selectedByGroup.some((ids) => ids.length !== 1) ||
          variant.optionValueIds.some((id) => !valueToGroup.has(id))
        ) {
          localErrors[`variants.${index}.optionValueIds`] =
            "Choose exactly one value from every group.";
        } else {
          const signature = selectedByGroup.flat().join(":");
          if (seenCombinations.has(signature))
            localErrors[`variants.${index}.optionValueIds`] =
              "This combination already exists.";
          seenCombinations.add(signature);
        }
      }
    });
    if (
      form.status === "published" &&
      form.isActive &&
      !variants.some((variant) => variant.isActive)
    )
      localErrors.variants = "A published Product needs an active option.";
    for (const key of ["ogImageUrl", "canonicalUrl"] as const) {
      const value = form[key].trim();
      if (value && (!/^https:\/\//i.test(value) || !URL.canParse(value)))
        localErrors[key] = "Enter a valid full HTTPS URL or leave this blank.";
    }
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setMessage("Review the marked fields and try again.");
      setMessageType("error");
      return;
    }
    if (pendingUploads) return;
    setSaving(true);

    try {
      const { gameId, ...formFields } = form;
      const parsedVariants = variants.map((variant) => {
        const price = parsePriceDraft(variant.price);
        const compareAtPrice = parsePriceDraft(variant.compareAtPrice, true);
        if (!price.ok || price.value === undefined || !compareAtPrice.ok) {
          throw new Error("Review the variant prices and try again.");
        }
        return {
          ...variant,
          price: price.value,
          compareAtPrice: compareAtPrice.value,
        };
      });
      const listing =
        [...parsedVariants]
          .filter((variant) => variant.isActive)
          .sort((a, b) => a.price - b.price)[0] ??
        [...parsedVariants].sort((a, b) => a.price - b.price)[0];
      const payload = {
        ...formFields,
        slug: finalizeSlug(form.slug || form.name),
        price: listing.price,
        compareAtPrice: listing.compareAtPrice,
        variants: parsedVariants.map((variant) => ({
          ...(variant.id ? { id: variant.id } : {}),
          label: structured
            ? optionGroups
                .map((group) =>
                  group.values
                    .find((value) => variant.optionValueIds.includes(value.id))
                    ?.label.trim(),
                )
                .filter(Boolean)
                .join(" + ")
            : variant.label.trim(),
          description: variant.description.trim(),
          price: variant.price,
          ...(variant.compareAtPrice !== undefined
            ? { compareAtPrice: variant.compareAtPrice }
            : {}),
          isActive: variant.isActive,
          optionValueIds: variant.optionValueIds,
        })),
        optionGroups: optionGroups.map((group) => ({
          id: group.id,
          name: group.name.trim(),
          values: group.values.map((value) => ({
            id: value.id,
            label: value.label.trim(),
          })),
        })),
        images: images.map((image) => ({
          imageUrl: image.imageUrl,
          altText: image.altText.trim(),
        })),
        ogImageUrl: form.ogImageUrl.trim() || (isEditing ? null : undefined),
        canonicalUrl:
          form.canonicalUrl.trim() || (isEditing ? null : undefined),
        currency: "USD",
      };

      let result: Product;
      if (isEditing) {
        result = await nestjsApi.products.update(
          productId,
          payload as UpdateProductDto,
        );
      } else {
        result = await nestjsApi.products.createForGame(
          gameId,
          payload as CreateProductForGameDto,
        );
      }

      setMessage(`Saved product "${result.name}"`);
      setMessageType("success");
      router.push("/admin/products");
      router.refresh();
    } catch (error) {
      if (error instanceof AdminFieldError) setFieldErrors(error.fields);
      setMessage(
        error instanceof Error ? error.message : "Could not save product",
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="adminForm"
        style={{ minHeight: 300, display: "grid", placeItems: "center" }}
      >
        <Loader2 className="adminSpinner" size={32} />
      </div>
    );
  }

  return (
    <form className="adminForm" onSubmit={submit}>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Catalog · Products</div>
          <h1>{isEditing ? "Edit product" : "Create new product"}</h1>
          <p>
            Choose the game and category, then set the options customers can
            buy.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="adminButton" href="/admin/products">
            Cancel
          </Link>
          <button
            className="adminButton primary"
            disabled={saving || pendingUploads > 0}
            type="submit"
          >
            {saving ? <Loader2 size={16} /> : "Save product"}
          </button>
        </div>
      </div>

      {message && (
        <div
          role={messageType === "error" ? "alert" : "status"}
          className={messageType === "success" ? "adminSuccess" : "adminNotice"}
        >
          {message}
        </div>
      )}
      {gamesError ? (
        <div className="adminNotice adminInlineFeedback" role="alert">
          <span>
            Games couldn’t load, so this product cannot be assigned safely.
          </span>
          <button
            type="button"
            className="adminButton"
            onClick={() => void loadGames()}
          >
            Try again
          </button>
        </div>
      ) : null}
      {categoriesError ? (
        <div className="adminNotice adminInlineFeedback" role="alert">
          <span>Categories couldn’t load for the selected game.</span>
          <button
            type="button"
            className="adminButton"
            onClick={() => void loadCategories()}
          >
            Try again
          </button>
        </div>
      ) : null}

      <section className="adminSection">
        <h2>General</h2>
        <div className="adminFormGrid">
          <div className="adminField">
            <label>
              Game <span style={{ color: "#e6002d" }}>*</span>
            </label>
            <select
              value={form.gameId}
              onChange={(e) => {
                setCategories([]);
                setForm((current) => ({
                  ...current,
                  gameId: e.target.value,
                  categoryId: "",
                }));
              }}
              required
              disabled={isEditing || gamesError}
            >
              <option value="">Select a game</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
            {fieldErrors.gameId ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.gameId}
              </small>
            ) : null}
            {isEditing && (
              <span className="adminHint">
                Game cannot be changed after creation.
              </span>
            )}
          </div>

          <div className="adminField">
            <label>
              Category <span style={{ color: "#e6002d" }}>*</span>
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              required
              disabled={!form.gameId || categoriesError}
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.categoryId}
              </small>
            ) : null}
            {!form.gameId && (
              <span className="adminHint">Select a game first.</span>
            )}
          </div>

          <div className="adminField">
            <label>
              Product type <span style={{ color: "#e6002d" }}>*</span>
            </label>
            <select
              value={form.productType}
              onChange={(e) =>
                set(
                  "productType",
                  e.target.value as ProductFormData["productType"],
                )
              }
              required
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {fieldErrors.productType ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.productType}
              </small>
            ) : null}
          </div>

          <div className="adminField">
            <label>
              Name <span style={{ color: "#e6002d" }}>*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => changeName(e.target.value)}
              placeholder="8 Ball Pool Coins"
              required
            />
            {fieldErrors.name ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.name}
              </small>
            ) : null}
          </div>

          <div className="adminField">
            <label>Slug</label>
            <input
              value={form.slug}
              onChange={(e) => changeSlug(e.target.value)}
              onBlur={finishSlug}
              placeholder="fc-25-coins-100m"
            />
            {fieldErrors.slug ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.slug}
              </small>
            ) : null}
            <span className="adminHint">
              Leave blank to generate from name.
            </span>
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>Options</h2>
        <ProductOptionsEditor
          groups={optionGroups}
          onChange={setOptionGroups}
          referencedValueIds={
            new Set(variants.flatMap((variant) => variant.optionValueIds))
          }
          errors={fieldErrors}
        />
      </section>

      <section className="adminSection">
        <h2>Variants</h2>
        <ProductVariantsEditor
          variants={variants}
          optionGroups={optionGroups}
          onChange={setVariants}
          errors={fieldErrors}
        />
      </section>

      <section className="adminSection">
        <h2>Delivery</h2>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>Requirements</label>
            <textarea
              value={form.requirements}
              onChange={(e) => set("requirements", e.target.value)}
              placeholder="Describe what the customer needs before delivery."
              rows={4}
            />
          </div>

          <div className="adminField full">
            <label>Delivery information</label>
            <textarea
              value={form.deliveryInformation}
              onChange={(e) => set("deliveryInformation", e.target.value)}
              placeholder="Describe the actual delivery process and timing."
              rows={3}
            />
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>Media</h2>
        <ProductMediaEditor
          images={images}
          onChange={setImages}
          onUploadStateChange={(delta) =>
            setPendingUploads((count) => count + delta)
          }
          productName={form.name}
        />
      </section>

      <section className="adminSection">
        <h2>Storefront</h2>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>Short description</label>
            <textarea
              value={form.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              rows={2}
              placeholder="A concise summary for product listings"
            />
          </div>
          <div className="adminField full productDescriptionField">
            <span>Full description</span>
            <BlogEditor
              value={form.description}
              onChange={(html) => set("description", html)}
              placeholder="Write a clear, detailed product description…"
              ariaLabel="Product full description"
              mode="product"
            />
            <small>
              Use short sections, lists, and safe links for a description that
              is easy to scan.
            </small>
          </div>
          <div className="adminField">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) =>
                set("status", e.target.value as ProductFormData["status"])
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="adminField">
            <label>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
              />{" "}
              Active
            </label>
          </div>
          <div className="adminField">
            <label>
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => set("featured", e.target.checked)}
              />{" "}
              Featured
            </label>
          </div>
        </div>
      </section>

      <section className="adminSection">
        <h2>SEO / Advanced</h2>
        <div className="adminFormGrid">
          <div className="adminField full">
            <label>SEO title</label>
            <input
              value={form.seoTitle}
              onChange={(e) => set("seoTitle", e.target.value)}
              placeholder="Optional search title"
            />
          </div>

          <div className="adminField full">
            <label>Meta description</label>
            <textarea
              value={form.seoDescription}
              onChange={(e) => set("seoDescription", e.target.value)}
              placeholder="Optional search description"
              rows={3}
            />
          </div>

          <div className="adminField full">
            <label>Meta keywords (comma-separated)</label>
            <input
              value={form.seoKeywords}
              onChange={(e) => set("seoKeywords", e.target.value)}
              placeholder="Optional keywords"
            />
          </div>

          <div className="adminField">
            <label>OG Image URL</label>
            <input
              value={form.ogImageUrl}
              onChange={(e) => set("ogImageUrl", e.target.value)}
              placeholder="https://mehtaxd.com/images/product-og.jpg"
            />
            {fieldErrors.ogImageUrl ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.ogImageUrl}
              </small>
            ) : null}
          </div>

          <div className="adminField">
            <label>Canonical URL</label>
            <input
              value={form.canonicalUrl}
              onChange={(e) => set("canonicalUrl", e.target.value)}
              placeholder="https://mehtaxd.com/products/product-slug"
            />
            {fieldErrors.canonicalUrl ? (
              <small className="adminFieldError" role="alert">
                {fieldErrors.canonicalUrl}
              </small>
            ) : null}
          </div>
        </div>
      </section>
    </form>
  );
}
