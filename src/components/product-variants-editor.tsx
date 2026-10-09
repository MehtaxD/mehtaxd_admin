"use client";

import { useState } from "react";

export type VariantForm = {
  key: string;
  id?: string;
  label: string;
  description: string;
  price: number;
  compareAtPrice: number;
  isActive: boolean;
};

export function newVariant(label = "Default", key = crypto.randomUUID()): VariantForm {
  return { key, label, description: "", price: 0, compareAtPrice: 0, isActive: true };
}

export function ProductVariantsEditor({ variants, onChange, errors }: {
  variants: VariantForm[];
  onChange: (variants: VariantForm[]) => void;
  errors: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<string[]>(variants[0] ? [variants[0].key] : []);

  function update(index: number, patch: Partial<VariantForm>) {
    onChange(variants.map((variant, position) => position === index ? { ...variant, ...patch } : variant));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= variants.length || from === to) return;
    const next = [...variants];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  }

  function add(variant: VariantForm) {
    onChange([...variants, variant]);
    setExpanded((current) => [...current, variant.key]);
  }

  return (
    <div className="adminProductVariants">
      <p className="adminHint">Add the options customers can choose. The first active option sets the listing’s starting price.</p>
      {variants.map((variant, index) => {
        const open = expanded.includes(variant.key) || Boolean(errors[`variants.${index}.price`] || errors[`variants.${index}.label`]);
        return (
          <div className="adminProductVariant" key={variant.key}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const source = variants.findIndex((item) => item.key === event.dataTransfer.getData("text/plain"));
              if (source >= 0) move(source, index);
            }}>
            <div className="adminProductVariantHead">
              <span className="adminProductDrag" draggable aria-label={`Drag ${variant.label || `option ${index + 1}`} to reorder`}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", variant.key); }}
                title="Drag to reorder">⋮⋮</span>
              <button type="button" className="adminProductVariantToggle" aria-expanded={open}
                onClick={() => setExpanded((current) => open ? current.filter((key) => key !== variant.key) : [...current, variant.key])}>
                <strong>{variant.label.trim() || `Option ${index + 1}`}</strong>
                <span>${Number.isFinite(variant.price) ? variant.price.toFixed(2) : "0.00"} · {variant.isActive ? "Active" : "Inactive"}</span>
              </button>
              <div className="adminProductVariantActions">
                <button type="button" className="adminButton" aria-label={`Move ${variant.label || `option ${index + 1}`} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>↑</button>
                <button type="button" className="adminButton" aria-label={`Move ${variant.label || `option ${index + 1}`} down`} disabled={index === variants.length - 1} onClick={() => move(index, index + 1)}>↓</button>
              </div>
            </div>
            {open ? <div className="adminProductVariantBody adminFormGrid">
              <div className="adminField">
                <label htmlFor={`variant-label-${variant.key}`}>Option name *</label>
                <input id={`variant-label-${variant.key}`} value={variant.label} maxLength={100} required
                  aria-invalid={Boolean(errors[`variants.${index}.label`])}
                  onChange={(event) => update(index, { label: event.target.value })} placeholder="100M" />
                {errors[`variants.${index}.label`] ? <small className="adminFieldError" role="alert">{errors[`variants.${index}.label`]}</small> : null}
              </div>
              <div className="adminField">
                <label htmlFor={`variant-price-${variant.key}`}>Price (USD) *</label>
                <input id={`variant-price-${variant.key}`} type="number" min="0" step="0.01" value={variant.price} required
                  aria-invalid={Boolean(errors[`variants.${index}.price`])}
                  onChange={(event) => update(index, { price: Number(event.target.value) })} />
                {errors[`variants.${index}.price`] ? <small className="adminFieldError" role="alert">{errors[`variants.${index}.price`]}</small> : null}
              </div>
              <div className="adminField">
                <label htmlFor={`variant-compare-${variant.key}`}>Compare-at price (USD)</label>
                <input id={`variant-compare-${variant.key}`} type="number" min="0" step="0.01" value={variant.compareAtPrice}
                  onChange={(event) => update(index, { compareAtPrice: Number(event.target.value) })} />
              </div>
              <div className="adminField full">
                <label htmlFor={`variant-description-${variant.key}`}>Short description</label>
                <textarea id={`variant-description-${variant.key}`} value={variant.description} maxLength={500} rows={2}
                  onChange={(event) => update(index, { description: event.target.value })} placeholder="Optional plain-text details for this option" />
              </div>
              <label className="adminProductVariantActive"><input type="checkbox" checked={variant.isActive}
                onChange={(event) => update(index, { isActive: event.target.checked })} /> Active for customers</label>
              <div className="adminProductVariantFooter">
                <button type="button" className="adminButton" onClick={() => add({ ...variant, key: crypto.randomUUID(), id: undefined, label: `${variant.label} copy` })}>Duplicate</button>
                <button type="button" className="adminButton" disabled={variants.length === 1}
                  onClick={() => onChange(variants.filter((_, position) => position !== index))}>Delete</button>
              </div>
            </div> : null}
          </div>
        );
      })}
      {errors.variants ? <p className="adminFieldError" role="alert">{errors.variants}</p> : null}
      <button type="button" className="adminButton" disabled={variants.length >= 20}
        onClick={() => add(newVariant(""))}>Add option</button>
    </div>
  );
}
