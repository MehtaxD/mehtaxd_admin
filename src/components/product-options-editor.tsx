"use client";

export type OptionValueForm = {
  id: string;
  label: string;
};

export type OptionGroupForm = {
  id: string;
  name: string;
  values: OptionValueForm[];
};

export function newOptionGroup(name = ""): OptionGroupForm {
  return {
    id: crypto.randomUUID(),
    name,
    values: [{ id: crypto.randomUUID(), label: "" }],
  };
}

export function ProductOptionsEditor({
  groups,
  onChange,
  referencedValueIds,
  errors,
}: {
  groups: OptionGroupForm[];
  onChange: (groups: OptionGroupForm[]) => void;
  referencedValueIds: Set<string>;
  errors: Record<string, string>;
}) {
  function updateGroup(index: number, patch: Partial<OptionGroupForm>) {
    onChange(
      groups.map((group, position) =>
        position === index ? { ...group, ...patch } : group,
      ),
    );
  }

  function moveGroup(from: number, to: number) {
    if (to < 0 || to >= groups.length || from === to) return;
    const next = [...groups];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  }

  function moveValue(groupIndex: number, from: number, to: number) {
    const values = [...groups[groupIndex].values];
    if (to < 0 || to >= values.length || from === to) return;
    values.splice(to, 0, values.splice(from, 1)[0]);
    updateGroup(groupIndex, { values });
  }

  function removeGroup(index: number) {
    const group = groups[index];
    if (group.values.some((value) => referencedValueIds.has(value.id))) return;
    onChange(groups.filter((_, position) => position !== index));
  }

  return (
    <div className="adminProductOptions">
      <div className="adminProductOptionsIntro">
        <div>
          <strong>Option groups</strong>
          <p className="adminHint">
            Define the choices first. No combinations are created automatically.
          </p>
        </div>
        <button
          type="button"
          className="adminButton"
          disabled={groups.length >= 8}
          onClick={() => onChange([...groups, newOptionGroup()])}
        >
          Add option group
        </button>
      </div>

      {groups.map((group, groupIndex) => {
        const groupReferenced = group.values.some((value) =>
          referencedValueIds.has(value.id),
        );
        return (
          <div
            className="adminProductOptionGroup"
            key={group.id}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes(
                  "application/x-mxd-option-group",
                )
              )
                event.preventDefault();
            }}
            onDrop={(event) => {
              const sourceId = event.dataTransfer.getData(
                "application/x-mxd-option-group",
              );
              const source = groups.findIndex((item) => item.id === sourceId);
              if (source >= 0) {
                event.preventDefault();
                moveGroup(source, groupIndex);
              }
            }}
          >
            <div className="adminProductOptionGroupHead">
              <span
                className="adminProductDrag"
                draggable
                title="Drag group to reorder"
                aria-label={`Drag ${group.name || "group"} to reorder`}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData(
                    "application/x-mxd-option-group",
                    group.id,
                  );
                }}
              >
                ⋮⋮
              </span>
              <div className="adminField">
                <label htmlFor={`option-group-${group.id}`}>Group name *</label>
                <input
                  id={`option-group-${group.id}`}
                  value={group.name}
                  maxLength={100}
                  placeholder="VIP Tier"
                  aria-invalid={Boolean(
                    errors[`optionGroups.${groupIndex}.name`],
                  )}
                  onChange={(event) =>
                    updateGroup(groupIndex, { name: event.target.value })
                  }
                />
                {errors[`optionGroups.${groupIndex}.name`] ? (
                  <small className="adminFieldError" role="alert">
                    {errors[`optionGroups.${groupIndex}.name`]}
                  </small>
                ) : null}
              </div>
              <div className="adminProductVariantActions">
                <button
                  type="button"
                  className="adminButton"
                  disabled={groupIndex === 0}
                  onClick={() => moveGroup(groupIndex, groupIndex - 1)}
                  aria-label={`Move ${group.name || "group"} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="adminButton"
                  disabled={groupIndex === groups.length - 1}
                  onClick={() => moveGroup(groupIndex, groupIndex + 1)}
                  aria-label={`Move ${group.name || "group"} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="adminButton"
                  disabled={groupReferenced}
                  onClick={() => removeGroup(groupIndex)}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="adminProductOptionValues">
              {group.values.map((value, valueIndex) => (
                <div
                  className="adminProductOptionValue"
                  key={value.id}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        `application/x-mxd-option-value-${group.id}`,
                      )
                    )
                      event.preventDefault();
                  }}
                  onDrop={(event) => {
                    const sourceId = event.dataTransfer.getData(
                      `application/x-mxd-option-value-${group.id}`,
                    );
                    const source = group.values.findIndex(
                      (item) => item.id === sourceId,
                    );
                    if (source >= 0) {
                      event.preventDefault();
                      moveValue(groupIndex, source, valueIndex);
                    }
                  }}
                >
                  <span
                    className="adminProductDrag"
                    draggable
                    title="Drag value to reorder"
                    aria-label={`Drag ${value.label || "value"} to reorder`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData(
                        `application/x-mxd-option-value-${group.id}`,
                        value.id,
                      );
                    }}
                  >
                    ⋮⋮
                  </span>
                  <div className="adminField">
                    <label htmlFor={`option-value-${value.id}`}>
                      Value {valueIndex + 1}
                    </label>
                    <input
                      id={`option-value-${value.id}`}
                      value={value.label}
                      maxLength={100}
                      placeholder={groupIndex === 0 ? "Bronze" : "1,350 Cash"}
                      aria-invalid={Boolean(
                        errors[
                          `optionGroups.${groupIndex}.values.${valueIndex}.label`
                        ],
                      )}
                      onChange={(event) =>
                        updateGroup(groupIndex, {
                          values: group.values.map((item) =>
                            item.id === value.id
                              ? { ...item, label: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                    {errors[
                      `optionGroups.${groupIndex}.values.${valueIndex}.label`
                    ] ? (
                      <small className="adminFieldError" role="alert">
                        {
                          errors[
                            `optionGroups.${groupIndex}.values.${valueIndex}.label`
                          ]
                        }
                      </small>
                    ) : null}
                  </div>
                  <div className="adminProductVariantActions">
                    <button
                      type="button"
                      className="adminButton"
                      disabled={valueIndex === 0}
                      onClick={() =>
                        moveValue(groupIndex, valueIndex, valueIndex - 1)
                      }
                      aria-label={`Move ${value.label || "value"} up`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="adminButton"
                      disabled={valueIndex === group.values.length - 1}
                      onClick={() =>
                        moveValue(groupIndex, valueIndex, valueIndex + 1)
                      }
                      aria-label={`Move ${value.label || "value"} down`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="adminButton"
                      disabled={referencedValueIds.has(value.id)}
                      onClick={() =>
                        updateGroup(groupIndex, {
                          values: group.values.filter(
                            (item) => item.id !== value.id,
                          ),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="adminButton adminAddOptionValue"
                disabled={group.values.length >= 50}
                onClick={() =>
                  updateGroup(groupIndex, {
                    values: [
                      ...group.values,
                      { id: crypto.randomUUID(), label: "" },
                    ],
                  })
                }
              >
                Add value
              </button>
            </div>
            {groupReferenced ? (
              <p className="adminHint">
                Remove combinations using this group before removing its
                selected values.
              </p>
            ) : null}
          </div>
        );
      })}
      {errors.optionGroups ? (
        <p className="adminFieldError" role="alert">
          {errors.optionGroups}
        </p>
      ) : null}
    </div>
  );
}
