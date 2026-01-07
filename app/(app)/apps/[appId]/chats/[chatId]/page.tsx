import { ChatDetailClient } from '@/components/chats/chat-detail-client'

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ appId: string; chatId: string }>
}) {
  const { appId, chatId } = await params

  return <ChatDetailClient appId={appId} chatId={chatId} />
}
