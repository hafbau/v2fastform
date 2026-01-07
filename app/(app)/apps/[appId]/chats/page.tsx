import { Suspense } from 'react'
import { ChatsClient } from '@/components/chats/chats-client'

export default async function ChatsPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatsClient appId={appId} />
    </Suspense>
  )
}
