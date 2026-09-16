"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Edit3, Plus, Trash2, Eye } from "@/components/icons";
import { nestjsApi, Game } from "@/lib/nestjs-api";

export default function AdminGamesPage() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadGames();
  }, []);

  async function loadGames() {
    try {
      setLoading(true);
      setError("");
      const response = await nestjsApi.games.list({ limit: 100 });
      setGames(response);
      setLoadFailed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Games couldn’t load. Check the connection and try again.");
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this game? This cannot be undone.")) return;
    setDeletingId(id);
    setError("");
    try {
      await nestjsApi.games.delete(id);
      setGames(games.filter((g) => g.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The game couldn’t be deleted. Refresh and try again.");
    } finally {
      setDeletingId(null);
    }
  }

  const statusBadge = (status: string) => (
    <span className={`adminBadge ${status}`}>{status}</span>
  );

  return (
    <>
      <div className="adminPageHead">
        <div>
          <div className="adminEyebrow">Catalog</div>
          <h1>Games</h1>
          <p>Games are the foundation of the storefront. Each game gets its own SEO-ready page, categories, products, content and FAQs.</p>
        </div>
        <Link className="adminButton primary" href="/admin/games/new">
          <Plus size={16} /> Add game
        </Link>
      </div>

      {error && <div className="adminNotice adminInlineFeedback" role="alert"><span>{error}</span>{loadFailed ? <button type="button" className="adminButton" onClick={() => void loadGames()}>Try again</button> : null}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#777" }}>Loading games…</div>
      ) : loadFailed ? null : games.length === 0 ? (
        <div className="adminPanel" style={{ textAlign: "center", padding: 60 }}>
          <p style={{ color: "#777", marginBottom: 16 }}>No games yet.</p>
          <Link className="adminButton primary" href="/admin/games/new"><Plus size={16} /> Create your first game</Link>
        </div>
      ) : (
        <div className="adminCardGrid">
          {games.map((game) => (
            <article className="adminGameCard" key={game.id}>
              <div className="mark">{game.mark}</div>
              <div className="adminEyebrow">{statusBadge(game.status)}</div>
              <h3>{game.name}</h3>
              <p>{game.shortDescription}</p>
              <div className="actions">
                <a className="adminButton" href={`/admin/games/${game.id}`}><Edit3 size={14} /> Edit</a>
                <Link className="adminButton" href={`/games/${game.slug}` as any} target="_blank" rel="noopener noreferrer"><Eye size={14} /> Preview</Link>
                <button className="adminButton" style={{ color: "#e6002d", borderColor: "#e6002d" }} onClick={() => handleDelete(game.id)} disabled={deletingId === game.id}>
                  {deletingId === game.id ? "Deleting…" : <Trash2 size={14} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
