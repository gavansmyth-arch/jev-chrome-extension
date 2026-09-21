// Ready-made question packs. Each pack is a plain `questions` object in the
// shape the TypeSafe /v1/systemone endpoint expects.

export const PACKS = Object.freeze({
  triage: {
    label: 'Support triage',
    hint: 'Emails, tickets, customer messages',
    questions: {
      needs_reply_today: {
        type: 'noul',
        instructions: 'Does this need a reply today?',
      },
      route_to: {
        type: 'choice',
        instructions: 'Which team should handle this?',
        criteria: {
          billing: 'Payments, charges or refunds',
          technical: 'Bugs, errors or outages',
          sales: 'Pricing, plans or new purchases',
          account: 'Login, access or account settings',
          other: 'Anything else',
        },
      },
      urgency: {
        type: 'score',
        instructions: 'How urgently does this need attention?',
        criteria: ['Can wait', 'Within a day or two', 'Needs attention now'],
      },
    },
  },

  scam: {
    label: 'Scam / phishing check',
    hint: 'Suspicious emails, texts, offers',
    questions: {
      is_likely_scam: {
        type: 'noul',
        instructions: 'Is this likely a scam, phishing attempt or fraud?',
      },
      asks_for_sensitive_info: {
        type: 'noul',
        instructions: 'Does it ask for passwords, codes, bank or card details, or payment?',
      },
      pressure: {
        type: 'score',
        instructions: 'How much urgency or pressure does it put on the reader?',
        criteria: ['None', 'Some', 'Heavy pressure or threats'],
      },
    },
  },

  moderation: {
    label: 'Content moderation',
    hint: 'Comments, posts, replies',
    questions: {
      targets_a_person: {
        type: 'noul',
        instructions: 'Is this directed at a specific individual?',
      },
      action: {
        type: 'choice',
        instructions: 'What moderation action should be taken?',
        criteria: {
          allow: 'Within the rules, no action needed',
          warn: 'Rude or heated but not abusive',
          remove: 'Personal abuse or harassment',
          ban: 'Severe abuse, threats, or repeated violations',
        },
      },
      hostility: {
        type: 'score',
        instructions: 'How hostile is the tone?',
        criteria: ['Neutral or friendly', 'Blunt but civil', 'Openly rude', 'Abusive or threatening'],
      },
    },
  },

  sentiment: {
    label: 'Sentiment & tone',
    hint: 'Reviews, feedback, social posts',
    questions: {
      is_positive: {
        type: 'noul',
        instructions: 'Is the overall sentiment positive?',
      },
      emotion: {
        type: 'choice',
        instructions: 'What is the main emotion?',
        criteria: {
          happy: 'Pleased, grateful, excited',
          neutral: 'Factual, no strong feeling',
          frustrated: 'Annoyed, disappointed',
          angry: 'Furious, hostile',
          worried: 'Anxious, confused, concerned',
        },
      },
      satisfaction: {
        type: 'score',
        instructions: 'How satisfied is the writer?',
        criteria: ['Very unhappy', 'Unhappy', 'Mixed', 'Happy', 'Delighted'],
      },
    },
  },

  lead: {
    label: 'Lead qualification',
    hint: 'Enquiries, LinkedIn messages, forms',
    questions: {
      ready_to_buy: {
        type: 'noul',
        instructions: 'Is this person showing clear intent to buy soon?',
      },
      stage: {
        type: 'choice',
        instructions: 'Where are they in the buying journey?',
        criteria: {
          browsing: 'Just curious or researching',
          evaluating: 'Comparing options, asking specifics',
          deciding: 'Asking about price, contracts, start dates',
          not_a_lead: 'Spam, job seeker, or unrelated',
        },
      },
      fit: {
        type: 'score',
        instructions: 'How strong a fit does this lead look?',
        criteria: ['Poor', 'Possible', 'Good', 'Excellent'],
      },
    },
  },
});

export const DEFAULT_PACK = 'triage';
