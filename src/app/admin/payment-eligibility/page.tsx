"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Edit3, Plus, Search, Trash2 } from "@/components/icons";
import {
  ExternalPaymentLayer,
  nestjsApi,
  PaymentAssignmentTarget,
  PaymentEligibilityConfiguration,
  PaymentProfile,
  PaymentProfileInput,
} from "@/lib/nestjs-api";

const layers: Array<{ id: ExternalPaymentLayer | "wallet"; label: string }> = [
  { id: "card", label: "Card" },
  { id: "crypto", label: "Crypto" },
  { id: "other", label: "Other" },
  { id: "wallet", label: "Wallet" },
];
const emptyProfile: PaymentProfileInput = {
  name: "",
  allowedExternalLayers: [],
  walletAllowed: false,
  enabled: true,
};

type Scope = "game" | "category" | "product";

export default function PaymentEligibilityPage() {
  const [config, setConfig] = useState<PaymentEligibilityConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PaymentProfileInput>(emptyProfile);
  const [defaultProfileId, setDefaultProfileId] = useState("");
  const [assignmentProfileId, setAssignmentProfileId] = useState("");
  const [scope, setScope] = useState<Scope>("product");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [productResults, setProductResults] = useState<PaymentAssignmentTarget[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productHasMore, setProductHasMore] = useState(false);
  const [productLoading, setProductLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const next = await nestjsApi.paymentProfiles.configuration();
      setConfig(next);
      setDefaultProfileId(next.defaultProfileId);
      setAssignmentProfileId((current) => current || next.profiles[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Payment eligibility couldn’t load. Try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => void load(), []);

  const targets = useMemo(() => {
    if (!config) return [];
    return scope === "game" ? config.games : scope === "category" ? config.categories : productResults;
  }, [config, scope, productResults]);
  const visibleTargets = useMemo(() => {
    if (scope === "product") return targets;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return targets;
    return targets.filter((target) => `${target.name} ${target.slug}`.toLocaleLowerCase().includes(query));
  }, [targets, search]);

  useEffect(() => {
    if (scope !== "product" || !config) return;
    let cancelled = false;
    setProductLoading(true);
    nestjsApi.paymentProfiles.products({ q: search, page: productPage, limit: 25 }).then((result) => {
      if (cancelled) return;
      setProductResults((current) => productPage === 1 ? result.items : [...current, ...result.items]);
      setProductHasMore(result.hasMore);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Products couldn’t load. Try again.");
    }).finally(() => { if (!cancelled) setProductLoading(false); });
    return () => { cancelled = true; };
  }, [scope, search, productPage, config]);
  const activeProfile = config?.profiles.find((profile) => profile.id === assignmentProfileId);

  useEffect(() => {
    setSelected((current) => current.size ? current : new Set(targets.filter((target) => target.paymentProfileId === assignmentProfileId).map((target) => target.id)));
  }, [assignmentProfileId, targets]);

  function toggleMethod(method: ExternalPaymentLayer | "wallet") {
    if (method === "wallet") {
      setForm((current) => ({ ...current, walletAllowed: !current.walletAllowed }));
      return;
    }
    setForm((current) => ({
      ...current,
      allowedExternalLayers: current.allowedExternalLayers.includes(method)
        ? current.allowedExternalLayers.filter((layer) => layer !== method)
        : [...current.allowedExternalLayers, method],
    }));
  }

  function beginEdit(profile: PaymentProfile) {
    setEditingId(profile.id);
    setForm({
      name: profile.name,
      allowedExternalLayers: profile.allowedExternalLayers,
      walletAllowed: profile.walletAllowed,
      enabled: profile.enabled,
    });
    document.getElementById("profile-editor")?.scrollIntoView();
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (editingId) await nestjsApi.paymentProfiles.update(editingId, form);
      else await nestjsApi.paymentProfiles.create(form);
      setNotice(editingId ? "Profile saved." : "Profile created.");
      setEditingId(null);
      setForm(emptyProfile);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The profile couldn’t be saved. Review it and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDefault() {
    if (!config || defaultProfileId === config.defaultProfileId) return;
    if (!confirm("Change the payment profile inherited by the whole store?")) return;
    setSaving(true);
    setError("");
    try {
      await nestjsApi.paymentProfiles.setStoreDefault(defaultProfileId);
      setNotice("Store default updated.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The store default couldn’t be changed. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignments() {
    if (!activeProfile) return;
    const current = new Set(targets.filter((target) => target.paymentProfileId === activeProfile.id).map((target) => target.id));
    const assignIds = [...selected].filter((id) => !current.has(id));
    const clearIds = [...current].filter((id) => !selected.has(id));
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (assignIds.length) await nestjsApi.paymentProfiles.updateAssignments(activeProfile.id, { scope, action: "assign", targetIds: assignIds });
      if (clearIds.length) await nestjsApi.paymentProfiles.updateAssignments(activeProfile.id, { scope, action: "clear", targetIds: clearIds });
      setNotice("Assignments saved. New orders will use the updated eligibility.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assignments couldn’t be saved. Refresh and try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeProfile(profile: PaymentProfile) {
    if (!confirm(`Delete “${profile.name}”?`)) return;
    setSaving(true);
    setError("");
    try {
      await nestjsApi.paymentProfiles.remove(profile.id);
      setNotice("Profile deleted.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The profile couldn’t be deleted. Remove its assignments first.");
    } finally {
      setSaving(false);
    }
  }

  function toggleTarget(target: PaymentAssignmentTarget) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(target.id)) next.delete(target.id);
      else next.add(target.id);
      return next;
    });
  }

  if (loading && !config) return <div className="adminPaymentStatus" role="status">Loading payment eligibility…</div>;

  return (
    <div className="paymentEligibilityPage">
      <header className="adminPageHead">
        <div>
          <div className="adminEyebrow">Payments</div>
          <h1>Payment Eligibility</h1>
          <p>Choose which payment methods new orders may use. Product overrides Category, then Game, then Store default.</p>
        </div>
      </header>

      {error ? <div className="adminNotice adminInlineFeedback" role="alert">{error}<button className="adminButton" onClick={() => void load()}>Reload</button></div> : null}
      {notice ? <div className="adminSuccessNotice" role="status">{notice}</div> : null}

      {config ? <>
        <section className="paymentDefaultPanel" aria-labelledby="store-default-title">
          <div>
            <div className="adminEyebrow">Global fallback</div>
            <h2 id="store-default-title">Store default</h2>
            <p>Used only when a Product, Category, and Game have no assignment.</p>
          </div>
          <div className="paymentDefaultAction">
            <label htmlFor="store-default">Current default profile</label>
            <select id="store-default" className="adminSelect" value={defaultProfileId} onChange={(event) => setDefaultProfileId(event.target.value)}>
              {config.profiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
            <button className="adminButton primary" disabled={saving || defaultProfileId === config.defaultProfileId} onClick={() => void saveDefault()}>{saving ? "Saving…" : "Save default"}</button>
          </div>
        </section>

        <section className="adminPanel paymentProfileSection" aria-labelledby="profiles-title">
          <div className="paymentSectionHead"><div><h2 id="profiles-title">Payment profiles</h2><p>Reusable method sets. Provider credentials and routing stay separate.</p></div><button className="adminButton" onClick={() => { setEditingId(null); setForm(emptyProfile); document.getElementById("profile-editor")?.scrollIntoView(); }}><Plus size={15}/> New profile</button></div>
          <div className="paymentProfileTableWrap"><table className="paymentProfileTable"><thead><tr><th>Name</th><th>Methods</th><th>Status</th><th>Assigned</th><th><span className="srOnly">Actions</span></th></tr></thead><tbody>
            {config.profiles.map((profile) => {
              const count = profile.assignments.games + profile.assignments.categories + profile.assignments.products;
              const protectedProfile = profile.isStoreDefault || count > 0;
              return <tr key={profile.id}><td><strong>{profile.name}</strong>{profile.isStoreDefault ? <small>Store default</small> : null}</td><td><div className="paymentMethodTags">{layers.filter((method) => method.id === "wallet" ? profile.walletAllowed : profile.allowedExternalLayers.includes(method.id)).map((method) => <span key={method.id}>{method.label}</span>)}</div></td><td><span className={`adminBadge ${profile.enabled ? "published" : "archived"}`}>{profile.enabled ? "Enabled" : "Disabled"}</span></td><td>{count ? `${count} catalog ${count === 1 ? "item" : "items"}` : "None"}</td><td><div className="paymentRowActions"><button className="adminButton" onClick={() => beginEdit(profile)}><Edit3 size={14}/> Edit</button><button className="adminIconButton" aria-label={`Delete ${profile.name}`} disabled={protectedProfile || saving} title={protectedProfile ? "Remove assignments and Store default use first" : "Delete profile"} onClick={() => void removeProfile(profile)}><Trash2 size={15}/></button></div></td></tr>;
            })}
          </tbody></table></div>
        </section>

        <section id="profile-editor" className="adminPanel paymentEditor" aria-labelledby="profile-editor-title">
          <div><div className="adminEyebrow">{editingId ? "Edit profile" : "New profile"}</div><h2 id="profile-editor-title">{editingId ? form.name : "Create payment profile"}</h2></div>
          <form onSubmit={saveProfile}>
            <label className="adminField">Profile name<input value={form.name} maxLength={120} required onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}/></label>
            <fieldset><legend>Allowed methods</legend><div className="paymentMethodChecks">{layers.map((method) => <label key={method.id}><input type="checkbox" checked={method.id === "wallet" ? form.walletAllowed : form.allowedExternalLayers.includes(method.id)} onChange={() => toggleMethod(method.id)}/><span>{method.label}</span></label>)}</div></fieldset>
            <label className="paymentEnabledCheck"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}/> Enabled for assignment</label>
            <div className="paymentFormActions"><button className="adminButton primary" disabled={saving || (!form.walletAllowed && form.allowedExternalLayers.length === 0)}>{saving ? "Saving…" : editingId ? "Save profile" : "Create profile"}</button>{editingId ? <button type="button" className="adminButton" onClick={() => { setEditingId(null); setForm(emptyProfile); }}>Cancel</button> : null}</div>
          </form>
        </section>

        <section className="adminPanel paymentAssignments" aria-labelledby="assignments-title">
          <div className="paymentSectionHead"><div><h2 id="assignments-title">Assignments</h2><p>Select a profile, scope, and catalog items. Clearing a selection restores inheritance.</p></div><button className="adminButton primary" disabled={saving || !assignmentProfileId} onClick={() => void saveAssignments()}>{saving ? "Saving…" : "Save assignments"}</button></div>
          <div className="paymentAssignmentControls"><label>Profile<select className="adminSelect" value={assignmentProfileId} onChange={(event) => { setAssignmentProfileId(event.target.value); setSelected(new Set()); }}>{config.profiles.filter((profile) => profile.enabled).map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><div className="paymentScopeTabs" aria-label="Assignment scope">{(["game", "category", "product"] as Scope[]).map((value) => <button type="button" key={value} aria-pressed={scope === value} onClick={() => { setScope(value); setSearch(""); setProductPage(1); setProductResults([]); }}>{value === "product" ? "Products" : `${value[0].toUpperCase()}${value.slice(1)}s`}</button>)}</div></div>
          {scope === "product" ? <label className="paymentSearch"><Search size={15}/><span className="srOnly">Search Products</span><input value={search} onChange={(event) => { setSearch(event.target.value); setProductPage(1); setProductResults([]); }} placeholder="Search Product name or slug"/></label> : null}
          {scope === "product" && productLoading ? <div role="status">Loading Products…</div> : null}
          <div className="paymentAssignmentSummary" role="status"><strong>{selected.size}</strong> selected for <strong>{activeProfile?.name ?? "profile"}</strong>. Product assignments override Category and Game.</div>
          <div className="paymentTargetList">{visibleTargets.map((target) => {
            const assignedProfile = config.profiles.find((profile) => profile.id === target.paymentProfileId);
            const replacing = target.paymentProfileId && target.paymentProfileId !== assignmentProfileId;
            return <label key={target.id} className={selected.has(target.id) ? "selected" : ""}><input type="checkbox" checked={selected.has(target.id)} onChange={() => toggleTarget(target)}/><span><strong>{target.name}</strong><small>{target.slug}</small></span><em className={replacing ? "replace" : ""}>{replacing ? `Replaces ${assignedProfile?.name ?? "another profile"}` : target.paymentProfileId ? "Assigned here" : "Inherits broader scope"}</em></label>;
          })}{!productLoading && visibleTargets.length === 0 ? <p className="paymentEmpty">No matching {scope}s.</p> : null}</div>
          {scope === "product" && productHasMore ? <button type="button" className="adminButton" onClick={() => setProductPage((page) => page + 1)} disabled={productLoading}>Load more Products</button> : null}
        </section>
      </> : null}
    </div>
  );
}
