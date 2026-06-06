import TechTreeEditor from '../components/ui/tech-tree-editor'
import { supabase, supabaseConfigured } from '@/lib/supabaseClient'
import type { TechNode } from '@/lib/types/tech-tree'
export const dynamic = 'force-dynamic';

export default async function Home() {
  let processedNodes: TechNode[] = []

  if (supabaseConfigured) {
    const { data: initialNodes, error } = await supabase
      .from('developments')
      .select('*')

    if (error) {
      console.error("Error fetching developments:", error)
    }

    processedNodes = (initialNodes || []).map(node => ({
      ...node,
      expanded: false,
    })) as TechNode[]
  }

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <TechTreeEditor initialTechNodes={processedNodes} />
    </main>
  )
}
