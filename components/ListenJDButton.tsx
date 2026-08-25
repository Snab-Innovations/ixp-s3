import React, { useState, useEffect } from 'react';
import { speak, unlockTTSAudio, cleanTextForTTS } from '../lib/tts';

interface ListenJDButtonProps {
  title?: string;
  description: string;
  lang?: string;
  className?: string;
  size?: 'sm' | 'md';
}

export const ListenJDButton: React.FC<ListenJDButtonProps> = ({
  title,
  description,
  lang = 'en',
  className = '',
  size = 'md'
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      // Clean up audio on unmount if playing
      speak.stop();
    };
  }, []);

  const handleToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      speak.stop();
      setIsPlaying(false);
    } else {
      unlockTTSAudio();
      speak.stop();
      setIsPlaying(true);

      const rawDescription = cleanTextForTTS(description);
      const textToRead = title
        ? `Role: ${cleanTextForTTS(title)}. ${rawDescription}`
        : rawDescription;

      speak(textToRead, {
        lang,
        rate: 0.95,
        onEnd: () => setIsPlaying(false),
        onError: () => setIsPlaying(false)
      });
    }
  };

  const isSmall = size === 'sm';

  return (
    <button
      type="button"
      onClick={handleToggle}
      onTouchEnd={(e) => {
        // Prevent ghost click on touch devices
        e.preventDefault();
        handleToggle(e);
      }}
      className={`inline-flex items-center gap-1.5 ${
        isSmall ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-xs sm:text-sm'
      } rounded-full font-extrabold transition-all duration-300 border cursor-pointer active:scale-95 select-none ${
        isPlaying
          ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/30 animate-pulse'
          : 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-700/60 hover:bg-blue-100 dark:hover:bg-blue-900/60'
      } ${className}`}
      title={isPlaying ? 'Pause reading Job Description' : 'Listen to Job Description aloud in natural HD voice'}
    >
      <i className={`fas ${isPlaying ? 'fa-pause' : 'fa-volume-high'} ${isSmall ? 'text-xs' : 'text-xs sm:text-sm'}`}></i>
      <span>{isPlaying ? 'Pause Audio' : 'Listen JD'}</span>
      {isPlaying && (
        <span className="flex gap-0.5 items-center ml-1">
          <span className="w-1 h-3 bg-white rounded-full animate-[bounce_0.6s_infinite_100ms]"></span>
          <span className="w-1 h-4 bg-white rounded-full animate-[bounce_0.6s_infinite_200ms]"></span>
          <span className="w-1 h-2.5 bg-white rounded-full animate-[bounce_0.6s_infinite_300ms]"></span>
        </span>
      )}
    </button>
  );
};

