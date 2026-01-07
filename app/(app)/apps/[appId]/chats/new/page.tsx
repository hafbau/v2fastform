import { NewChatClient } from '@/components/chats/new-chat-client'

export default async function NewChatPage({
  params,
}: {
  params: Promise<{ appId: string }>
}) {
  const { appId } = await params

  return <NewChatClient appId={appId} />
}
