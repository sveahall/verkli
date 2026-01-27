import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function insertLibraryBook(params: {
  title: string;
  author?: string;
  coverUrl?: string;
  summary?: string;
  authorsNote?: string;
  content?: string;
  tags?: string[];
}) {
  const supabase = createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('library_books')
    .insert({
      user_id: user.id,
      title: params.title,
      author: params.author,
      cover_url: params.coverUrl,
      summary: params.summary,
      authors_note: params.authorsNote,
      content: params.content,
      tags: params.tags
    })
    .select()
    .single()

  if (error) throw error
  return data
}
