import { PromptOutputLanguage, UserSettings } from '../types';

export const applyPromptOutputLanguage = (
  settings: UserSettings,
  promptOutputLanguage: PromptOutputLanguage
): UserSettings => {
  const front = promptOutputLanguage === 'zh' ? 'Chinese' : 'English';
  const back = promptOutputLanguage === 'zh' ? 'English' : 'Chinese';

  return {
    ...settings,
    promptOutputLanguage,
    cardFrontLanguage: front,
    cardBackLanguage: back,
  };
};
