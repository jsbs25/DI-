import { decideNotification, isDndActiveAtMinutes, normalizeNotificationPrefs } from '../server/notificationPolicy.ts';

function assert(cond: any, msg: string) { if (!cond) throw new Error(msg); }

function run() {
  // DND cross-midnight
  assert(isDndActiveAtMinutes({ ...normalizeNotificationPrefs({}), dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' }, 22*60+30) === true, 'dnd late night');
  assert(isDndActiveAtMinutes({ ...normalizeNotificationPrefs({}), dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' }, 7*60+59) === true, 'dnd early morning');
  assert(isDndActiveAtMinutes({ ...normalizeNotificationPrefs({}), dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' }, 8*60) === false, 'dnd end boundary');
  assert(isDndActiveAtMinutes({ ...normalizeNotificationPrefs({}), dndEnabled: true, dndStart: '09:00', dndEnd: '17:00' }, 10*60) === true, 'dnd daytime');
  assert(isDndActiveAtMinutes({ ...normalizeNotificationPrefs({}), dndEnabled: true, dndStart: '12:00', dndEnd: '12:00' }, 12*60) === false, 'dnd equal times');

  // prefs filtering
  const offMsg = decideNotification({ messages: false, desktop: true, sound: true, dndEnabled: false }, 'message_new');
  assert(offMsg.persist === true, 'persist always');
  assert(offMsg.pushRealtime === false, 'message push off');
  assert(offMsg.alertDesktop === false && offMsg.alertSound === false, 'message alerts off');

  const onMsgDnd = decideNotification({ messages: true, desktop: true, sound: true, dndEnabled: true, dndStart: '22:00', dndEnd: '08:00' }, 'message_new', { localMinutes: 23*60 });
  assert(onMsgDnd.pushRealtime === true, 'dnd still pushes to center');
  assert(onMsgDnd.alertDesktop === false && onMsgDnd.alertSound === false, 'dnd suppresses alerts');

  const friendReqOff = decideNotification({ friendRequests: false }, 'friend_request');
  assert(friendReqOff.categoryEnabled === false, 'friend request off');

  const friendAccOn = decideNotification({ friendAccepted: true, friendRequests: false }, 'friend_accepted');
  assert(friendAccOn.categoryEnabled === true, 'friend accepted independent');

  const groupOff = decideNotification({ groupEvents: false }, 'group_admin_changed');
  assert(groupOff.alertDesktop === false, 'group event off');

  console.log(JSON.stringify({ ok: true }));
}

run();
