import TechTreeViewer from '@/components/TechTreeViewer'
import inventionsData from '@/data/inventions.json'

export default function Home() {
  return <TechTreeViewer nodes={inventionsData.nodes} links={inventionsData.links} />
}
