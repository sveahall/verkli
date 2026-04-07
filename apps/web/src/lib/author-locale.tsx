"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

// ─── Locale keys ────────────────────────────────────────────────────────────

type AuthorLocaleKey =
  | "library.title"
  | "library.subtitle"
  | "library.emptyTitle"
  | "library.emptyBody"
  | "production.emptyTitle"
  | "production.emptyBody"
  | "production.createBook"
  | "production.sectionTitle"
  | "production.sectionBody";

// ─── English (default) ──────────────────────────────────────────────────────

const EN: Record<AuthorLocaleKey, string> = {
  "library.title": "Library",
  "library.subtitle": "All your books in one place",
  "library.emptyTitle": "Create your first book",
  "library.emptyBody": "Start by creating a book to open your writing workspace.",
  "production.emptyTitle": "No books yet",
  "production.emptyBody": "Create your first book to get started with production.",
  "production.createBook": "Create book",
  "production.sectionTitle": "Choose a book to work on",
  "production.sectionBody": "Open a book to write, edit, translate, generate an audiobook, and more.",
};

// ─── Translations ────────────────────────────────────────────────────────────
// Add new languages by adding an entry to LOCALES.
// Only keys that differ from English are needed.

const SV: Partial<Record<AuthorLocaleKey, string>> = {
  "library.title": "Bibliotek",
  "library.subtitle": "Alla dina böcker på ett ställe",
  "library.emptyTitle": "Skapa din första bok",
  "library.emptyBody": "Börja med att skapa en bok för att öppna din skrivarbetsyta.",
  "production.emptyTitle": "Inga böcker ännu",
  "production.emptyBody": "Skapa din första bok för att komma igång med produktion.",
  "production.createBook": "Skapa bok",
  "production.sectionTitle": "Välj bok att arbeta med",
  "production.sectionBody": "Öppna en bok för att skriva, redigera, översätta, generera ljudbok och mer.",
};

const ES: Partial<Record<AuthorLocaleKey, string>> = {
  "library.title": "Biblioteca",
  "library.subtitle": "Todos tus libros en un lugar",
  "library.emptyTitle": "Crea tu primer libro",
  "library.emptyBody": "Empieza creando un libro para abrir tu espacio de escritura.",
  "production.emptyTitle": "Aún no hay libros",
  "production.emptyBody": "Crea tu primer libro para comenzar con la producción.",
  "production.createBook": "Crear libro",
  "production.sectionTitle": "Elige un libro para trabajar",
  "production.sectionBody": "Abre un libro para escribir, editar, traducir, generar audiolibros y más.",
};

const FR: Partial<Record<AuthorLocaleKey, string>> = {
  "library.title": "Bibliothèque",
  "library.subtitle": "Tous vos livres au même endroit",
  "library.emptyTitle": "Créez votre premier livre",
  "library.emptyBody": "Commencez par créer un livre pour ouvrir votre espace d'écriture.",
  "production.emptyTitle": "Pas encore de livres",
  "production.emptyBody": "Créez votre premier livre pour démarrer la production.",
  "production.createBook": "Créer un livre",
  "production.sectionTitle": "Choisissez un livre à travailler",
  "production.sectionBody": "Ouvrez un livre pour écrire, éditer, traduire, générer des livres audio et plus.",
};

const DE: Partial<Record<AuthorLocaleKey, string>> = {
  "library.title": "Bibliothek",
  "library.subtitle": "Alle Ihre Bücher an einem Ort",
  "library.emptyTitle": "Erstellen Sie Ihr erstes Buch",
  "library.emptyBody": "Beginnen Sie mit der Erstellung eines Buches, um Ihren Schreibbereich zu öffnen.",
  "production.emptyTitle": "Noch keine Bücher",
  "production.emptyBody": "Erstellen Sie Ihr erstes Buch, um mit der Produktion zu beginnen.",
  "production.createBook": "Buch erstellen",
  "production.sectionTitle": "Wählen Sie ein Buch zum Arbeiten",
  "production.sectionBody": "Öffnen Sie ein Buch zum Schreiben, Bearbeiten, Übersetzen, Hörbuch erstellen und mehr.",
};

const PT: Partial<Record<AuthorLocaleKey, string>> = {
  "library.title": "Biblioteca",
  "library.subtitle": "Todos os seus livros em um lugar",
  "library.emptyTitle": "Crie seu primeiro livro",
  "library.emptyBody": "Comece criando um livro para abrir seu espaço de escrita.",
  "production.emptyTitle": "Ainda sem livros",
  "production.emptyBody": "Crie seu primeiro livro para começar com a produção.",
  "production.createBook": "Criar livro",
  "production.sectionTitle": "Escolha um livro para trabalhar",
  "production.sectionBody": "Abra um livro para escrever, editar, traduzir, gerar audiolivros e mais.",
};

const LOCALES: Record<string, Partial<Record<AuthorLocaleKey, string>>> = {
  sv: SV,
  es: ES,
  fr: FR,
  de: DE,
  pt: PT,
};

// ─── Server-side locale context ──────────────────────────────────────────────
// AuthorAppShell passes the user's profile-stored language preference here.
// Falls back to browser locale if not set.

const LocaleContext = createContext<string | null>(null);

export function LocaleProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: string | null;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

function detectBrowserLocale(): string {
  if (typeof navigator === "undefined") return "en";
  return navigator.language.split("-")[0].toLowerCase();
}

export function useAuthorLocale(): (key: AuthorLocaleKey) => string {
  const contextLocale = useContext(LocaleContext);
  const browserLocale = useMemo(() => detectBrowserLocale(), []);
  const locale = contextLocale ?? browserLocale;
  return (key: AuthorLocaleKey) => LOCALES[locale]?.[key] ?? EN[key];
}
