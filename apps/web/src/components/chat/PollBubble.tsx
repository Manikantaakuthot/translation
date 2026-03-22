import { BarChart2, Check } from 'lucide-react';

interface PollData {
  question: string;
  options: { text: string; voters: string[] }[];
  allowMultiple: boolean;
}

interface Props {
  poll: PollData;
  messageId: string;
  currentUserId?: string;
  isOwn: boolean;
  onVote: (messageId: string, optionIndex: number) => void;
}

export default function PollBubble({ poll, messageId, currentUserId, isOwn, onVote }: Props) {
  const totalVotes = poll.options.reduce((sum, opt) => sum + (opt.voters?.length || 0), 0);

  const hasVoted = (optionIndex: number) =>
    currentUserId ? poll.options[optionIndex]?.voters?.includes(currentUserId) : false;

  const hasVotedAny = poll.options.some((opt) => currentUserId && opt.voters?.includes(currentUserId));

  const getPercentage = (voters: string[]) => {
    if (totalVotes === 0) return 0;
    return Math.round(((voters?.length || 0) / totalVotes) * 100);
  };

  const handleVote = (optionIndex: number) => {
    // If already voted on this option, toggle off. If single-choice and voted elsewhere, still allow.
    onVote(messageId, optionIndex);
  };

  return (
    <div className="min-w-[240px] max-w-[320px]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <BarChart2 size={16} className={isOwn ? 'text-[#075E54] dark:text-[#34B7F1]' : 'text-[#128C7E]'} />
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Poll</span>
      </div>

      {/* Question */}
      <p className="text-sm font-semibold text-gray-800 dark:text-[#E9EDEF] mb-3 leading-snug">
        {poll.question}
      </p>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const voted = hasVoted(index);
          const pct = getPercentage(option.voters || []);
          const isLeading = totalVotes > 0 && pct === Math.max(...poll.options.map((o) => getPercentage(o.voters || [])));

          return (
            <button
              key={index}
              onClick={() => handleVote(index)}
              className={`w-full text-left rounded-xl relative overflow-hidden transition-all ${
                voted
                  ? 'border-2 border-[#128C7E] dark:border-[#00A884]'
                  : 'border border-gray-200 dark:border-gray-600 hover:border-[#128C7E]/50'
              }`}
            >
              {/* Progress bar background — show to all users when votes exist */}
              {totalVotes > 0 && (
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 rounded-xl ${
                    isLeading
                      ? 'bg-[#128C7E]/15 dark:bg-[#00A884]/15'
                      : 'bg-gray-100 dark:bg-[#2A3942]/50'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              )}

              <div className="relative px-3 py-2.5 flex items-center gap-2">
                {/* Check circle */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                    voted
                      ? 'bg-[#128C7E] dark:bg-[#00A884]'
                      : 'border-2 border-gray-300 dark:border-gray-500'
                  }`}
                >
                  {voted && <Check size={12} className="text-white" strokeWidth={3} />}
                </div>

                {/* Option text */}
                <span
                  className={`text-sm flex-1 ${
                    voted ? 'font-semibold text-[#128C7E] dark:text-[#00A884]' : 'text-gray-700 dark:text-[#E9EDEF]'
                  }`}
                >
                  {option.text}
                </span>

                {/* Vote count + percentage — show to all when votes exist */}
                {totalVotes > 0 && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums font-medium">
                    {pct}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        </span>
        {poll.allowMultiple && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">
            Select multiple
          </span>
        )}
      </div>
    </div>
  );
}
