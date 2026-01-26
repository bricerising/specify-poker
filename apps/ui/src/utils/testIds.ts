export const testIds = {
  auth: {
    login: "auth-login",
    signOut: "auth-sign-out",
  },
  nav: {
    lobby: "nav-lobby",
    profile: "nav-profile",
    friends: "nav-friends",
  },
  lobby: {
    tableCard: "lobby-table-card",
    joinSeat: "lobby-join-seat",
    watchTable: "lobby-watch-table",
    inviteLink: "lobby-invite-link",
    copyInvite: "lobby-copy-invite",
  },
  createTable: {
    name: "create-table-name",
    smallBlind: "create-table-small-blind",
    bigBlind: "create-table-big-blind",
    maxPlayers: "create-table-max-players",
    startingStack: "create-table-starting-stack",
    submit: "create-table-submit",
  },
  table: {
    leave: "table-leave",
  },
  action: {
    amount: "action-amount",
    betSizing: "action-bet-sizing",
    presetHalfPot: "action-preset-half-pot",
    presetThreeQuarterPot: "action-preset-three-quarter-pot",
    presetPot: "action-preset-pot",
    presetAllIn: "action-preset-all-in",
    submit: "action-submit",
  },
  chat: {
    toggle: "chat-toggle",
    message: "chat-message",
    send: "chat-send",
  },
  profile: {
    username: "profile-username",
    avatarUrl: "profile-avatar-url",
    save: "profile-save",
  },
  friends: {
    addInput: "friends-add-input",
    add: "friends-add",
    remove: "friends-remove",
  },
  moderation: {
    kick: "moderation-kick",
    mute: "moderation-mute",
  },
} as const;

