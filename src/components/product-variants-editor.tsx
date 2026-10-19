"use client";

import { useState } from "react";
import type { OptionGroupForm } from "@/components/product-options-editor";
import {
  displayPriceDraft,
  type PriceDraft,
} from "@/lib/price-input";

export type VariantForm = {
  key: string;
  id?: string;
  label: string;
  description: string;
  price: PriceDraft;
  compareAtPrice: PriceDraft;
  isActive: boolean;
  optionValueIds: string[];
};

export function newVariant(
  label = "Default",
  key = crypto.randomUUID(),
  optionValueIds: string[] = [],
): VariantForm {
  return {
    key,
    label,
    description: "",
    price: "0",
    compareAtPrice: "",
    isActive: true,
    optionValueIds,
  };
}

function combinationLabel(variant: VariantForm, groups: OptionGroupForm[]) {
  const labels = groups
    .map((group) =>
      group.values
        .find((value) => variant.optionValueIds.includes(value.id))
        ?.label.trim(),
    )
    .filter(Boolean);
  return labels.length ? labels.join(" + ") : variant.label.trim();
}

export function ProductVariantsEditor({
  variants,
  optionGroups,
  onChange,
  errors,
}: {
  variants: VariantForm[];
  optionGroups: OptionGroupForm[];
  onChange: (variants: VariantForm[]) => void;
  errors: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<string[]>(
    variants[0] ? [variants[0].key] : [],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const structured = optionGroups.length > 0;

  function update(index: number, patch: Partial<VariantForm>) {
    onChange(
      variants.map((variant, position) =>
        position === index ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= variants.length || from === to) return;
    const next = [...variants];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  }

  function add(optionValueIds: string[] = []) {
    const variant = newVariant("", crypto.randomUUID(), optionValueIds);
    onChange([...variants, variant]);
    setExpanded((current) => [...current, variant.key]);
  }

  function selectValue(index: number, group: OptionGroupForm, valueId: string) {
    const groupIds = new Set(group.values.map((value) => value.id));
    const optionValueIds = variants[index].optionValueIds.filter(
      (id) => !groupIds.has(id),
    );
    if (valueId) optionValueIds.push(valueId);
    const draft = { ...variants[index], optionValueIds };
    update(index, {
      optionValueIds,
      label: combinationLabel(draft, optionGroups),
    });
  }

  function duplicate(index: number) {
    const source = variants[index];
    const optionValueIds = structured ? source.optionValueIds.slice(0, -1) : [];
    const copy = {
      ...source,
      key: crypto.randomUUID(),
      id: undefined,
      optionValueIds,
      label: structured
        ? combinationLabel({ ...source, optionValueIds }, optionGroups)
        : `${source.label} copy`,
    };
    onChange([...variants, copy]);
    setExpanded((current) => [...current, copy.key]);
  }

  function renderVariant(variant: VariantForm, index: number) {
    const displayLabel = structured
      ? combinationLabel(variant, optionGroups)
      : variant.label.trim();
    const open =
      expanded.includes(variant.key) ||
      Object.keys(errors).some((key) => key.startsWith(`variants.${index}.`));
    const displayPrice = displayPriceDraft(variant.price);
    return (
      <div
        className="adminProductVariant"
        key={variant.key}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const source = variants.findIndex(
            (item) => item.key === event.dataTransfer.getData("text/plain"),
          );
          if (source >= 0) move(source, index);
        }}
      >
        <div className="adminProductVariantHead">
          <span
            className="adminProductDrag"
            draggable
            aria-label={`Drag ${displayLabel || `combination ${index + 1}`} to reorder`}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", variant.key);
            }}
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
          <button
            type="button"
            className="adminProductVariantToggle"
            aria-expanded={open}
            onClick={() =>
              setExpanded((current) =>
                open
                  ? current.filter((key) => key !== variant.key)
                  : [...current, variant.key],
              )
            }
          >
            <strong>{displayLabel || `Combination ${index + 1}`}</strong>
            <span>
              $
              {displayPrice ?? "—"}{" "}
              · {variant.isActive ? "Active" : "Inactive"}
            </span>
          </button>
          <div className="adminProductVariantActions">
            <button
              type="button"
              className="adminButton"
              aria-label={`Move ${displayLabel || `combination ${index + 1}`} up`}
              disabled={index === 0}
              onClick={() => move(index, index - 1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="adminButton"
              aria-label={`Move ${displayLabel || `combination ${index + 1}`} down`}
              disabled={index === variants.length - 1}
              onClick={() => move(index, index + 1)}
            >
              ↓
            </button>
          </div>
        </div>
        {open ? (
          <div className="adminProductVariantBody adminFormGrid">
            {structured ? (
              optionGroups.map((group) => {
                const selected =
                  group.values.find((value) =>
                    variant.optionValueIds.includes(value.id),
                  )?.id ?? "";
                return (
                  <div className="adminField" key={group.id}>
                    <label htmlFor={`variant-${variant.key}-${group.id}`}>
                      {group.name.trim() || "Unnamed group"} *
                    </label>
                    <select
                      id={`variant-${variant.key}-${group.id}`}
                      value={selected}
                      aria-invalid={Boolean(
                        errors[`variants.${index}.optionValueIds`],
                      )}
                      onChange={(event) =>
                        selectValue(index, group, event.target.value)
                      }
                    >
                      <option value="">Choose a value</option>
                      {group.values.map((value) => (
                        <option key={value.id} value={value.id}>
                          {value.label || "Unnamed value"}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })
            ) : (
              <div className="adminField">
                <label htmlFor={`variant-label-${variant.key}`}>
                  Option name *
                </label>
                <input
                  id={`variant-label-${variant.key}`}
                  value={variant.label}
                  maxLength={100}
                  required
                  aria-invalid={Boolean(errors[`variants.${index}.label`])}
                  onChange={(event) =>
                    update(index, { label: event.target.value })
                  }
                  placeholder="100M"
                />
                {errors[`variants.${index}.label`] ? (
                  <small className="adminFieldError" role="alert">
                    {errors[`variants.${index}.label`]}
                  </small>
                ) : null}
              </div>
            )}
            {errors[`variants.${index}.optionValueIds`] ? (
              <small className="adminFieldError full" role="alert">
                {errors[`variants.${index}.optionValueIds`]}
              </small>
            ) : null}
            <div className="adminField">
              <label htmlFor={`variant-price-${variant.key}`}>
                Price (USD) *
              </label>
              <input
                id={`variant-price-${variant.key}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={variant.price}
                required
                aria-invalid={Boolean(errors[`variants.${index}.price`])}
                onChange={(event) => update(index, { price: event.target.value })}
              />
              {errors[`variants.${index}.price`] ? (
                <small className="adminFieldError" role="alert">
                  {errors[`variants.${index}.price`]}
                </small>
              ) : null}
            </div>
            <div className="adminField">
              <label htmlFor={`variant-compare-${variant.key}`}>
                Compare-at price (USD)
              </label>
              <input
                id={`variant-compare-${variant.key}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={variant.compareAtPrice}
                aria-invalid={Boolean(
                  errors[`variants.${index}.compareAtPrice`],
                )}
                onChange={(event) =>
                  update(index, { compareAtPrice: event.target.value })
                }
              />
              {errors[`variants.${index}.compareAtPrice`] ? (
                <small className="adminFieldError" role="alert">
                  {errors[`variants.${index}.compareAtPrice`]}
                </small>
              ) : null}
            </div>
            <div className="adminField full">
              <label htmlFor={`variant-description-${variant.key}`}>
                Short description
              </label>
              <textarea
                id={`variant-description-${variant.key}`}
                value={variant.description}
                maxLength={500}
                rows={2}
                onChange={(event) =>
                  update(index, { description: event.target.value })
                }
                placeholder="Optional plain-text details for this combination"
              />
            </div>
            <label className="adminProductVariantActive">
              <input
                type="checkbox"
                checked={variant.isActive}
                onChange={(event) =>
                  update(index, { isActive: event.target.checked })
                }
              />{" "}
              Active for customers
            </label>
            <div className="adminProductVariantFooter">
              <button
                type="button"
                className="adminButton"
                onClick={() => duplicate(index)}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="adminButton"
                disabled={variants.length === 1 && !structured}
                onClick={() =>
                  onChange(variants.filter((_, position) => position !== index))
                }
              >
                Delete
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  const primaryGroup = structured ? optionGroups[0] : null;
  const grouped = primaryGroup
    ? primaryGroup.values.map((value) => ({
        value,
        entries: variants
          .map((variant, index) => ({ variant, index }))
          .filter(({ variant }) => variant.optionValueIds.includes(value.id)),
      }))
    : [];
  const unassigned = primaryGroup
    ? variants
        .map((variant, index) => ({ variant, index }))
        .filter(
          ({ variant }) =>
            !primaryGroup.values.some((value) =>
              variant.optionValueIds.includes(value.id),
            ),
        )
    : [];

  return (
    <div className="adminProductVariants">
      <p className="adminHint">
        {structured
          ? "Add only combinations you actually sell. Nothing is generated automatically."
          : "Add the options customers can choose. The first active option sets the listing’s starting price."}
      </p>
      {structured ? (
        <>
          {grouped.map(({ value, entries }) => (
            <section className="adminCombinationGroup" key={value.id}>
              <div className="adminCombinationGroupHead">
                <button
                  type="button"
                  className="adminCombinationGroupToggle"
                  aria-expanded={!collapsedGroups.includes(value.id)}
                  onClick={() =>
                    setCollapsedGroups((current) =>
                      current.includes(value.id)
                        ? current.filter((id) => id !== value.id)
                        : [...current, value.id],
                    )
                  }
                >
                  <strong>{value.label || "Unnamed value"}</strong>
                  <span>
                    {entries.length}{" "}
                    {entries.length === 1 ? "package" : "packages"}
                    {(() => {
                      const prices = entries
                        .map(({ variant }) => displayPriceDraft(variant.price))
                        .filter((price): price is string => price !== null)
                        .map(Number);
                      return prices.length
                        ? ` · From $${Math.min(...prices).toFixed(2)}`
                        : "";
                    })()}
                  </span>
                </button>
                <button
                  type="button"
                  className="adminButton"
                  disabled={variants.length >= 100}
                  onClick={() => add([value.id])}
                >
                  Add combination
                </button>
              </div>
              {!collapsedGroups.includes(value.id) &&
                (entries.length ? (
                  entries.map(({ variant, index }) =>
                    renderVariant(variant, index),
                  )
                ) : (
                  <p className="adminEmptyCompact">
                    No sellable combination added for this value.
                  </p>
                ))}
            </section>
          ))}
          {unassigned.length ? (
            <section className="adminCombinationGroup">
              <div className="adminCombinationGroupHead">
                <div>
                  <strong>Needs selection</strong>
                  <span>{unassigned.length} incomplete</span>
                </div>
              </div>
              {unassigned.map(({ variant, index }) =>
                renderVariant(variant, index),
              )}
            </section>
          ) : null}
          {!primaryGroup?.values.length ? (
            <button type="button" className="adminButton" disabled>
              Add values to the first group to create combinations
            </button>
          ) : null}
        </>
      ) : (
        <>
          {variants.map(renderVariant)}
          <button
            type="button"
            className="adminButton"
            disabled={variants.length >= 100}
            onClick={() => add()}
          >
            Add option
          </button>
        </>
      )}
      {errors.variants ? (
        <p className="adminFieldError" role="alert">
          {errors.variants}
        </p>
      ) : null}
    </div>
  );
}
