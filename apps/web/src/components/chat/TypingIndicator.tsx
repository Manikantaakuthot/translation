interface Props {
  userIds: string[];
  participants: { userId: string; name?: string }[];
}

export default function TypingIndicator({ userIds, participants }: Props) {
  if (userIds.length === 0) return null;
  const list = Array.isArray(participants) ? participants : [];
  const names = userIds
    .map((id) => list.find((p) => p.userId === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return null;
  return (
    <div className="px-4 py-1">
      <p className="text-sm text-gray-500 dark:text-[#8696A0] italic">
        {names.join(', ')} {names.length === 1 ? 'is' : 'are'} typing...
      </p>
    </div>
  );
}
