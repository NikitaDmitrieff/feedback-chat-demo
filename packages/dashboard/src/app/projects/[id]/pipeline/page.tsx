import { redirect } from 'next/navigation'

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/projects/${id}/minions`)
}
