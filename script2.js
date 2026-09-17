// ===== DUELO SEMANAL (tela) =====
function loadDuelScreen() {
  if (!currentUser) { document.getElementById("duelContent").innerHTML = "<p>Faça login pra duelar.</p>"; return; }
  document.getElementById("duelContent").innerHTML = "<p>Carregando...</p>";
  db.collection("users").doc(currentUser.uid).get().then(docSnap => {
    const activeDuelId = docSnap.exists ? docSnap.data().activeDuelId : null;
    if (!activeDuelId) { renderDuelChallengeForm(); return; }
    db.collection("duels").doc(activeDuelId).get().then(duelSnap => {
      if (!duelSnap.exists) { renderDuelChallengeForm(); return; }
      renderDuelPanel(duelSnap.id, duelSnap.data());
    });
  });
}
// fim loadDuelScreen

function renderDuelChallengeForm() {
  document.getElementById("duelContent").innerHTML = `
    <div class="admin-form">
      <p style="font-size:13px;">Desafie alguém pra ver quem faz mais % da semana. Digite o nickname:</p>
      <input type="text" id="duelTargetInput" placeholder="Nickname do desafiado">
      <button class="menu-btn" onclick="sendDuelChallenge()">Desafiar</button>
    </div>
  `;
}
// fim renderDuelChallengeForm

function sendDuelChallenge() {
  const target = document.getElementById("duelTargetInput").value.trim();
  if (!target) return;
  if (target.toLowerCase() === (currentNickname || "").toLowerCase()) {
    showToast("Você não pode se desafiar."); return;
  }

  db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
    if (snap.empty) { showToast("Nickname não encontrado."); return; }
    const opponentDoc = snap.docs[0];
    const opponentData = opponentDoc.data();

    if (opponentData.activeDuelId) { showToast(`${target} já está em outro duelo.`); return; }

    const duelRef = db.collection("duels").doc();
    duelRef.set({
      challengerUid: currentUser.uid,
      challengerNick: currentNickname,
      opponentUid: opponentDoc.id,
      opponentNick: opponentData.nickname,
      weekKey: currentSundayKey,
      status: "pending",
      challengerScore: 0,
      opponentScore: 0,
      winnerUid: null
    }).then(() => {
      db.collection("users").doc(currentUser.uid).update({ activeDuelId: duelRef.id });
      db.collection("users").doc(opponentDoc.id).update({ activeDuelId: duelRef.id });
      showToast(`Desafio enviado pra ${target}!`);
      createNotification(opponentDoc.id, "duel_challenge", "Novo desafio de duelo", `${currentNickname} te desafiou pra um duelo semanal!`);
      loadDuelScreen();
    });
  }).catch(e => showToast("Erro: " + e.message));
}
// fim sendDuelChallenge

function renderDuelPanel(duelId, duel) {
  const content = document.getElementById("duelContent");
  const iAmChallenger = duel.challengerUid === currentUser.uid;
  const myNick = iAmChallenger ? duel.challengerNick : duel.opponentNick;
  const oppNick = iAmChallenger ? duel.opponentNick : duel.challengerNick;
  const myScore = iAmChallenger ? duel.challengerScore : duel.opponentScore;
  const oppScore = iAmChallenger ? duel.opponentScore : duel.challengerScore;

  let body = "";

  if (duel.status === "pending" && !iAmChallenger) {
    body += `
      <p>${duel.challengerNick} te desafiou pra essa semana!</p>
      <button class="menu-btn" onclick="respondDuel('${duelId}', true)">Aceitar</button>
      <button class="menu-btn menu-btn-danger" onclick="respondDuel('${duelId}', false)">Recusar</button>`;
  } else if (duel.status === "pending" && iAmChallenger) {
    body += `
      <p>Aguardando ${duel.opponentNick} responder...</p>
      <button class="menu-btn menu-btn-danger" onclick="cancelDuel('${duelId}')">Cancelar desafio</button>`;
  } else if (duel.status === "active") {
    body += `
      <div class="duel-vs">
        <div><strong>${myNick}</strong><br>${myScore}%</div>
        <div class="duel-vs-x">×</div>
        <div><strong>${oppNick}</strong><br>${oppScore}%</div>
      </div>
      <p style="font-size:11px; opacity:.8;">Atualiza conforme vocês marcam tarefas na semana. Resultado sai quando a semana virar.</p>`;
  } else if (duel.status === "finished") {
    const won = duel.winnerUid === currentUser.uid;
    const draw = !duel.winnerUid;
    body += `
      <div class="duel-vs">
        <div><strong>${myNick}</strong><br>${myScore}%</div>
        <div class="duel-vs-x">×</div>
        <div><strong>${oppNick}</strong><br>${oppScore}%</div>
      </div>
      <p style="font-size:16px; font-weight:bold; margin-top:10px;">${draw ? "🤝 Empate!" : (won ? "<i class='fa-solid fa-trophy'></i> Você venceu!" : "😔 Você perdeu.")}</p>
      <button class="menu-btn" onclick="dismissDuel()">OK</button>`;
  } else {
    body += `
      <p>Esse duelo não está mais ativo (status: ${duel.status}).</p>
      <button class="menu-btn" onclick="dismissDuel()">Liberar minha conta</button>`;
  }

  content.innerHTML = body;
}
// fim renderDuelPanel

function respondDuel(duelId, accept) {
  const duelRef = db.collection("duels").doc(duelId);
  if (accept) {
    duelRef.update({ status: "active", weekKey: currentSundayKey }).then(() => {
      showToast("Duelo aceito! Boa sorte.");
      loadDuelScreen();
    });
  } else {
    duelRef.get().then(snap => {
      const duel = snap.data();
      duelRef.update({ status: "declined" });
      db.collection("users").doc(duel.challengerUid).update({ activeDuelId: null });
      db.collection("users").doc(duel.opponentUid).update({ activeDuelId: null });
      showToast("Duelo recusado.");
      loadDuelScreen();
    });
  }
}
// fim respondDuel

function cancelDuel(duelId) {
  db.collection("duels").doc(duelId).get().then(snap => {
    const duel = snap.data();
    db.collection("duels").doc(duelId).update({ status: "declined" });
    db.collection("users").doc(duel.challengerUid).update({ activeDuelId: null });
    db.collection("users").doc(duel.opponentUid).update({ activeDuelId: null });
    showToast("Desafio cancelado.");
    loadDuelScreen();
  });
}
// fim cancelDuel

function dismissDuel() {
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).update({ activeDuelId: null }).then(() => {
    loadDuelScreen();
  });
}
// fim dismissDuel

function syncDuelScore(percent) {
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).get().then(docSnap => {
    const activeDuelId = docSnap.exists ? docSnap.data().activeDuelId : null;
    if (!activeDuelId) return;
    db.collection("duels").doc(activeDuelId).get().then(duelSnap => {
      if (!duelSnap.exists) return;
      const duel = duelSnap.data();
      if (duel.status !== "active" || duel.weekKey !== currentSundayKey) return;
      const field = duel.challengerUid === currentUser.uid ? "challengerScore" : "opponentScore";
      db.collection("duels").doc(activeDuelId).update({ [field]: percent });
    });
  });
}
// fim syncDuelScore

function checkDuelWeekRollover() {
  if (!currentUser) return;
  db.collection("users").doc(currentUser.uid).get().then(docSnap => {
    const activeDuelId = docSnap.exists ? docSnap.data().activeDuelId : null;
    if (!activeDuelId) return;
    db.collection("duels").doc(activeDuelId).get().then(duelSnap => {
      if (!duelSnap.exists) return;
      const duel = duelSnap.data();
      if (duel.status === "active" && duel.weekKey !== currentSundayKey) {
        let winnerUid = null;
        if (duel.challengerScore > duel.opponentScore) winnerUid = duel.challengerUid;
        else if (duel.opponentScore > duel.challengerScore) winnerUid = duel.opponentUid;

        db.collection("duels").doc(activeDuelId).update({ status: "finished", winnerUid });

        if (winnerUid) {
          db.collection("users").doc(winnerUid).update({
            duelWins: firebase.firestore.FieldValue.increment(1)
          });
        }

        const resultFor = (uid) => {
          if (!winnerUid) return "Seu duelo terminou empatado!";
          return uid === winnerUid ? "Você venceu o duelo! <i class='fa-solid fa-trophy'></i>" : "Você perdeu o duelo.";
        };
        createNotification(duel.challengerUid, "duel_result", "Duelo finalizado", resultFor(duel.challengerUid));
        createNotification(duel.opponentUid, "duel_result", "Duelo finalizado", resultFor(duel.opponentUid));
      }
    });
  });
}
// fim checkDuelWeekRollover

// ===== AMIGOS (tela) =====
function openFriendsListModal(uid) {
  const overlay = document.getElementById("friendsListOverlay");
  overlay.innerHTML = "<div class='ranking-box'><p>Carregando...</p></div>";
  overlay.classList.remove("hidden");

  db.collection("users").doc(uid).get().then(docSnap => {
    const friends = (docSnap.data() || {}).friends || [];
    if (friends.length === 0) {
      overlay.innerHTML = `<div class="ranking-box"><h3>Amigos</h3><p>Nenhum amigo ainda.</p><button class="menu-btn" onclick="closeFriendsListModal()">Fechar</button></div>`;
      return;
    }
    Promise.all([
      Promise.all(friends.map(fid => db.collection("users").doc(fid).get())),
      currentUser ? db.collection("users").doc(currentUser.uid).get() : Promise.resolve(null)
    ]).then(([friendSnaps, myDocSnap]) => {
      const myFriends = myDocSnap && myDocSnap.exists ? (myDocSnap.data().friends || []) : [];
      let rows = "";
      friendSnaps.forEach(s => {
        if (!s.exists) return;
        const data = s.data();
        const isMe = currentUser && s.id === currentUser.uid;
        const alreadyMyFriend = myFriends.includes(s.id);
        let btn = "";
        if (currentUser && !isMe) {
          btn = alreadyMyFriend
            ? `<button class="menu-btn-small" disabled style="opacity:.6;cursor:default;">Amigo</button>`
            : `<button class="menu-btn-small" onclick="sendFriendRequest('${s.id}','${(data.nickname||"").replace(/'/g,"")}', this)">+ Adicionar</button>`;
        }
        rows += `
          <div class="friend-row">
            <span onclick="closeFriendsListModal(); viewProfile('${s.id}')" style="cursor:pointer;">${data.nickname}</span>
            ${btn}
          </div>`;
      });
      overlay.innerHTML = `<div class="ranking-box"><h3>Amigos</h3>${rows}<br><button class="menu-btn" onclick="closeFriendsListModal()">Fechar</button></div>`;
    });
  }).catch(e => {
    overlay.innerHTML = `<div class="ranking-box"><p>Erro: ${e.message}</p><button class="menu-btn" onclick="closeFriendsListModal()">Fechar</button></div>`;
  });
}
// fim openFriendsListModal

function closeFriendsListModal() {
  document.getElementById("friendsListOverlay").classList.add("hidden");
}
// fim closeFriendsListModal

function loadFriendsScreen() {
  if (!currentUser) { document.getElementById("friendsContent").innerHTML = "<p>Faça login pra ver amigos.</p>"; return; }
  const content = document.getElementById("friendsContent");
  content.innerHTML = `
    <div class="friends-search">
      <input type="text" id="friendSearchInput" placeholder="Pesquisar nickname">
      <button class="menu-btn" onclick="searchFriends()">Pesquisar</button>
    </div>
    <div id="friendSearchResults"></div>
    <hr style="border-color: rgba(46,204,113,0.2); margin: 16px 0;">
    <div id="friendRequestsBox"></div>
    <div id="friendListBox"><p>Carregando amigos...</p></div>
  `;
  loadFriendRequests();
  loadFriendList();
}
// fim loadFriendsScreen

function searchFriends() {
  const q = document.getElementById("friendSearchInput").value.trim().toLowerCase();
  const resultsBox = document.getElementById("friendSearchResults");
  if (!q) { resultsBox.innerHTML = ""; return; }

  Promise.all([
    db.collection("users").doc(currentUser.uid).get(),
    db.collection("friendRequests").where("fromUid", "==", currentUser.uid).where("status", "==", "pending").get(),
    db.collection("users")
      .where("nicknameLower", ">=", q)
      .where("nicknameLower", "<=", q + "\uf8ff")
      .limit(10)
      .get()
  ]).then(([myDoc, sentReqSnap, searchSnap]) => {
    const myFriends = (myDoc.data() || {}).friends || [];
    const sentTo = sentReqSnap.docs.map(d => d.data().toUid);

    let rows = "";
    searchSnap.forEach(d => {
      if (d.id === currentUser.uid) return;
      const data = d.data();
      let btn;
      if (myFriends.includes(d.id)) {
        btn = `<button class="menu-btn-small" disabled style="opacity:.6;cursor:default;">Amigo</button>`;
      } else if (sentTo.includes(d.id)) {
        btn = `<button class="menu-btn-small" disabled style="opacity:.6;cursor:default;">Enviado</button>`;
      } else {
        btn = `<button class="menu-btn-small" onclick="sendFriendRequest('${d.id}','${(data.nickname||"").replace(/'/g,"")}', this)">+ Adicionar</button>`;
      }
      rows += `
        <div class="friend-row">
          <span onclick="viewProfile('${d.id}')" style="cursor:pointer;">${data.nickname}</span>
          ${btn}
        </div>`;
    });
    resultsBox.innerHTML = rows || "<p style='font-size:12px;opacity:.7;'>Ninguém encontrado.</p>";
  }).catch(e => { resultsBox.innerHTML = `<p>Erro: ${e.message}</p>`; });
}
// fim searchFriends

function sendFriendRequest(toUid, toNick, btnEl) {
  if (!currentUser) return;

  const markDone = () => {
    if (btnEl) {
      btnEl.textContent = "Amigo";
      btnEl.disabled = true;
      btnEl.style.opacity = "0.6";
      btnEl.style.cursor = "default";
      btnEl.onclick = null;
    }
  };

  Promise.all([
    db.collection("users").doc(currentUser.uid).get(),
    db.collection("users").doc(toUid).get()
  ]).then(([myDoc, theirDoc]) => {
    const myFriends = (myDoc.data() || {}).friends || [];
    const theirFriends = (theirDoc.data() || {}).friends || [];

    if (myFriends.includes(toUid) && theirFriends.includes(currentUser.uid)) {
      showToast("Vocês já são amigos.");
      markDone();
      return;
    }

    if (myFriends.includes(toUid) || theirFriends.includes(currentUser.uid)) {
      Promise.all([
        db.collection("users").doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(toUid) }),
        db.collection("users").doc(toUid).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) })
      ]).then(() => {
        showToast(`Agora você e ${toNick} são amigos!`);
        markDone();
      }).catch(e => showToast("Erro: " + e.message));
      return;
    }

    db.collection("friendRequests")
      .where("fromUid", "==", toUid).where("toUid", "==", currentUser.uid).where("status", "==", "pending")
      .limit(1).get().then(reverseSnap => {
        if (!reverseSnap.empty) {
          respondFriendRequest(reverseSnap.docs[0].id, true);
          markDone();
          return;
        }

        db.collection("friendRequests")
          .where("fromUid", "==", currentUser.uid).where("toUid", "==", toUid).limit(1).get()
          .then(snap => {
            if (!snap.empty) {
              showToast("Pedido já enviado.");
              if (btnEl) {
                btnEl.textContent = "Enviado";
                btnEl.disabled = true;
                btnEl.style.opacity = "0.6";
                btnEl.style.cursor = "default";
                btnEl.onclick = null;
              }
              return;
            }
            db.collection("friendRequests").add({
              fromUid: currentUser.uid, fromNick: currentNickname,
              toUid, toNick, status: "pending", createdAt: Date.now()
            }).then(() => {
              showToast(`Pedido enviado pra ${toNick}.`);
              createNotification(toUid, "friend_request", "Novo pedido de amizade", `${currentNickname} quer ser seu amigo.`);
              if (btnEl) {
                btnEl.textContent = "Enviado";
                btnEl.disabled = true;
                btnEl.style.opacity = "0.6";
                btnEl.style.cursor = "default";
                btnEl.onclick = null;
              }
            });
          });
      });
  });
}
// fim sendFriendRequest

function loadFriendRequests() {
  const box = document.getElementById("friendRequestsBox");
  db.collection("friendRequests").where("toUid", "==", currentUser.uid).where("status", "==", "pending").get()
    .then(snap => {
      if (snap.empty) { box.innerHTML = ""; return; }
      let rows = `<h4 style="margin-top:0;">Pedidos recebidos</h4>`;
      snap.forEach(d => {
        const data = d.data();
        rows += `
          <div class="friend-row">
            <span>${data.fromNick}</span>
            <button class="menu-btn-small" onclick="respondFriendRequest('${d.id}', true)">Aceitar</button>
            <button class="menu-btn-small menu-btn-danger" onclick="respondFriendRequest('${d.id}', false)">Recusar</button>
          </div>`;
      });
      box.innerHTML = rows;
    });
}
// fim loadFriendRequests

function respondFriendRequest(reqId, accept) {
  const reqRef = db.collection("friendRequests").doc(reqId);
  reqRef.get().then(snap => {
    const req = snap.data();
    if (accept) {
      Promise.all([
        db.collection("users").doc(req.fromUid).update({ friends: firebase.firestore.FieldValue.arrayUnion(req.toUid) }),
        db.collection("users").doc(req.toUid).update({ friends: firebase.firestore.FieldValue.arrayUnion(req.fromUid) }),
        reqRef.update({ status: "accepted" })
      ]).then(() => {
        showToast(`Agora você e ${req.fromNick} são amigos!`);
        createNotification(req.fromUid, "friend_accepted", "Pedido aceito", `${currentNickname || "Alguém"} aceitou seu pedido de amizade.`);
        loadFriendsScreen();
      }).catch(e => {
        showToast("Erro ao aceitar (tenta de novo): " + e.message);
      });
    } else {
      reqRef.update({ status: "declined" }).then(() => loadFriendsScreen());
    }
  });
}
// fim respondFriendRequest

function loadFriendList() {
  const box = document.getElementById("friendListBox");
  db.collection("users").doc(currentUser.uid).get().then(docSnap => {
    const friends = (docSnap.data() || {}).friends || [];
    if (friends.length === 0) { box.innerHTML = "<p style='font-size:12px;opacity:.7;'>Você ainda não tem amigos adicionados.</p>"; return; }
    const promises = friends.map(uid => db.collection("users").doc(uid).get());
    const chatPromises = friends.map(uid => db.collection("chats").doc(getChatId(uid)).get());
    Promise.all([Promise.all(promises), Promise.all(chatPromises)]).then(([snaps, chatSnaps]) => {
      let rows = `<h4>Seus amigos</h4>`;
      snaps.forEach((s, i) => {
        if (!s.exists) return;
        const data = s.data();
        const chatSnap = chatSnaps[i];
        let hasUnread = false;
        if (chatSnap.exists) {
          const cd = chatSnap.data();
          const lastRead = (cd.lastReadBy && cd.lastReadBy[currentUser.uid]) || 0;
          hasUnread = (cd.lastMessageAt || 0) > lastRead && cd.lastMessageFrom !== currentUser.uid;
        }
        rows += `
          <div class="friend-row">
            <span onclick="viewProfile('${s.id}')" style="cursor:pointer;">${data.nickname}</span>
            <span>
              <button class="menu-btn-small" onclick="openChat('${s.id}','${(data.nickname||"").replace(/'/g,"")}')"><i class="fa-solid fa-comment"></i> Chat${hasUnread ? ' <i class="fa-solid fa-circle" style="font-size:6px; color:#e74c3c;"></i>' : ""}</button>
              <button class="menu-btn-small" onclick="challengeFriend('${s.id}','${(data.nickname||"").replace(/'/g,"")}')"><i class="fa-solid fa-hand-fist"></i> Duelar</button>
            </span>
          </div>`;
      });
      box.innerHTML = rows;
    });
  });
}
// fim loadFriendList

// ===== CHAT PRIVADO =====
function getChatId(otherUid) {
  return [currentUser.uid, otherUid].sort().join("_");
}
// fim getChatId

let chatMessagesCache = {};

function openChat(otherUid, otherNick) {
  currentChatId = getChatId(otherUid);
  currentChatOtherUid = otherUid;
  currentChatOtherNick = otherNick;
  document.getElementById("chatWithName").innerText = otherNick;
  showScreen("chat");

  db.collection("chats").doc(currentChatId).set({
    participants: [currentUser.uid, otherUid],
    lastReadBy: { [currentUser.uid]: Date.now() }
  }, { merge: true });

  if (chatUnsubscribe) chatUnsubscribe();
  chatUnsubscribe = db.collection("chats").doc(currentChatId).collection("messages")
    .orderBy("createdAt", "asc")
    .onSnapshot(snap => {
      const box = document.getElementById("chatMessagesBox");
      let html = "";
      chatMessagesCache = {};
      snap.forEach(d => {
        const m = d.data();
        chatMessagesCache[d.id] = m;
        const mine = m.fromUid === currentUser.uid;

        if (m.shareType) {
          const icon = m.shareType === "checklist" ? "fa-list-check" : "fa-calendar-days";
          html += `<div style="display:flex; justify-content:${mine ? "flex-end" : "flex-start"}; margin:6px 0;">
            <div style="max-width:80%; padding:10px 14px; border-radius:14px; background:rgba(46,204,113,0.12); border:1px solid rgba(46,204,113,0.4); font-size:13px;">
              <i class="fa-solid ${icon}"></i> ${m.text}
              ${!mine ? `<button class="aura-btn" style="margin-top:8px; display:block; width:100%;" onclick="acceptSharedMessage('${d.id}')"><i class="fa-solid fa-check"></i> Aceitar</button>` : `<span style="opacity:.6; font-size:11px;">Enviado</span>`}
            </div>
          </div>`;
        } else {
          html += `<div style="display:flex; justify-content:${mine ? "flex-end" : "flex-start"}; margin:6px 0;">
            <div style="max-width:75%; padding:8px 12px; border-radius:14px; background:${mine ? "rgba(46,204,113,0.25)" : "rgba(0,0,0,0.4)"}; border:1px solid rgba(46,204,113,0.3); font-size:13px;">
              ${m.text}
            </div>
          </div>`;
        }
      });
      box.innerHTML = html || "<p style='font-size:12px; opacity:.7; text-align:center;'>Nenhuma mensagem ainda. Diga oi!</p>";
      box.scrollTop = box.scrollHeight;

      db.collection("chats").doc(currentChatId).set({
        lastReadBy: { [currentUser.uid]: Date.now() }
      }, { merge: true });
    });
}
// fim openChat

function acceptSharedMessage(messageId) {
  const m = chatMessagesCache[messageId];
  if (!m || !m.shareType) return;
  if (m.shareType === "checklist") acceptSharedChecklist(m.sharePayload);
  else if (m.shareType === "agenda") acceptSharedAgenda(m.sharePayload);
  else if (m.shareType === "sharedAgendaInvite") acceptSharedAgendaInvite(m.sharePayload);
  else if (m.shareType === "note") acceptSharedNote(m.sharePayload);
}
// fim acceptSharedMessage

function acceptSharedChecklist(payload) {
  checklists.push({
    id: "cl" + Date.now() + Math.floor(Math.random() * 1000),
    name: payload.name,
    items: (payload.items || []).map((it, i) => ({ id: "cli" + Date.now() + i + Math.floor(Math.random() * 1000), name: it.name, done: false }))
  });
  saveState();
  showToast("Checklist adicionado no seu app!");
}
// fim acceptSharedChecklist

function acceptSharedAgenda(payload) {
  const item = {
    id: "ag" + Date.now() + Math.floor(Math.random() * 1000),
    name: payload.name,
    type: payload.type,
    xpEnabled: !!payload.xpEnabled,
    value: payload.value || 0
  };
  if (item.type === "once") item.date = todayKey;
  if (item.type === "weekly") item.weekdays = payload.weekdays || [];
  if (item.type === "monthly") item.monthDay = payload.monthDay;
  agendaItems.push(item);
  saveState();
  showToast("Item adicionado na sua agenda!");
}
// fim acceptSharedAgenda

function shareChecklistViaChat(checklistId) {
  const list = checklists.find(c => c.id === checklistId);
  if (!list) return;
  openModal({
    title: "Nickname de quem vai receber esse checklist:",
    type: "text",
    confirmLabel: "Enviar",
    onConfirm: (nick) => {
      const target = (nick || "").trim();
      if (!target) return;
      db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
        if (snap.empty) { showToast("Nickname não encontrado."); return; }
        const toUid = snap.docs[0].id;
        const chatId = getChatId(toUid);
        const payload = { name: list.name, items: (list.items || []).map(i => ({ name: i.name })) };
        const text = `Compartilhou um checklist: "${list.name}" (${payload.items.length} itens)`;
        db.collection("chats").doc(chatId).collection("messages").add({
          fromUid: currentUser.uid, text, shareType: "checklist", sharePayload: payload, createdAt: Date.now()
        });
        db.collection("chats").doc(chatId).set({
          participants: [currentUser.uid, toUid], lastMessage: text, lastMessageAt: Date.now(),
          lastMessageFrom: currentUser.uid, lastReadBy: { [currentUser.uid]: Date.now() }
        }, { merge: true });
        showToast(`Checklist enviado pra ${target}!`);
      });
    }
  });
}
// fim shareChecklistViaChat

function shareAgendaItemViaChat(itemId) {
  const item = agendaItems.find(i => i.id === itemId);
  if (!item) return;
  openModal({
    title: "Nickname de quem vai receber esse item da agenda:",
    type: "text",
    confirmLabel: "Enviar",
    onConfirm: (nick) => {
      const target = (nick || "").trim();
      if (!target) return;
      db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
        if (snap.empty) { showToast("Nickname não encontrado."); return; }
        const toUid = snap.docs[0].id;
        const chatId = getChatId(toUid);
        const payload = { name: item.name, type: item.type, xpEnabled: item.xpEnabled, value: item.value, weekdays: item.weekdays, monthDay: item.monthDay };
        const text = `Compartilhou um item da agenda: "${item.name}"`;
        db.collection("chats").doc(chatId).collection("messages").add({
          fromUid: currentUser.uid, text, shareType: "agenda", sharePayload: payload, createdAt: Date.now()
        });
        db.collection("chats").doc(chatId).set({
          participants: [currentUser.uid, toUid], lastMessage: text, lastMessageAt: Date.now(),
          lastMessageFrom: currentUser.uid, lastReadBy: { [currentUser.uid]: Date.now() }
        }, { merge: true });
        showToast(`Item enviado pra ${target}!`);
      });
    }
  });
}
// fim shareAgendaItemViaChat

function sendChatMessage() {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  input.value = "";

  db.collection("chats").doc(currentChatId).collection("messages").add({
    fromUid: currentUser.uid,
    text,
    createdAt: Date.now()
  });

  db.collection("chats").doc(currentChatId).set({
    participants: [currentUser.uid, currentChatOtherUid],
    lastMessage: text,
    lastMessageAt: Date.now(),
    lastMessageFrom: currentUser.uid,
    lastReadBy: { [currentUser.uid]: Date.now() }
  }, { merge: true });
}
// fim sendChatMessage

function challengeFriend(uid, nick) {
  if (!currentUser) return;
  if (uid === currentUser.uid) { showToast("Você não pode se desafiar."); return; }

  db.collection("users").doc(currentUser.uid).get().then(myDoc => {
    if (myDoc.exists && myDoc.data().activeDuelId) {
      showToast("Você já está em um duelo.");
      showScreen("duel");
      return;
    }
    db.collection("users").doc(uid).get().then(theirDoc => {
      if (theirDoc.exists && theirDoc.data().activeDuelId) {
        showToast(`${nick} já está em outro duelo.`);
        return;
      }
      const duelRef = db.collection("duels").doc();
      duelRef.set({
        challengerUid: currentUser.uid,
        challengerNick: currentNickname,
        opponentUid: uid,
        opponentNick: nick,
        weekKey: currentSundayKey,
        status: "pending",
        challengerScore: 0,
        opponentScore: 0,
        winnerUid: null
      }).then(() => {
        db.collection("users").doc(currentUser.uid).update({ activeDuelId: duelRef.id });
        db.collection("users").doc(uid).update({ activeDuelId: duelRef.id });
        showToast(`Desafio enviado pra ${nick}!`);
        createNotification(uid, "duel_challenge", "Novo desafio de duelo", `${currentNickname} te desafiou pra um duelo semanal!`);
        showScreen("duel");
      });
    });
  });
}
// fim challengeFriend

// ===== RESET DE PATENTE (3 passos) =====
function startResetPatente() {
  if (!currentUser) { showToast("Faça login pra usar essa função."); return; }
  openModal({
    title: "Tem certeza que quer resetar sua patente? Isso zera todo o seu XP e não pode ser desfeito.",
    type: "confirm",
    confirmLabel: "Concordo",
    onConfirm: () => {
      openModal({
        title: "Digite seu Nickname pra confirmar:",
        type: "text",
        confirmLabel: "Confirmar reset",
        onConfirm: (typed) => {
          if ((typed || "").trim().toLowerCase() === (currentNickname || "").toLowerCase()) {
            const level = getLevelFromXP(xp);
            const rankName = getRankFromLevel(level);
            awardMedal(rankName);
            xp = 0;
            saveState();
            updateLevelUI();
            showToast(`Patente resetada! Medalha de ${rankName} adicionada ao seu perfil.`);
          } else {
            showToast("Nickname não confere. Reset cancelado.");
          }
        }
      });
    }
  });
}
// fim startResetPatente

// ===== ADM: enviar notificação (pra todo mundo ou pra 1 pessoa) =====
// Essas funções redefinem as de mesmo nome do script.js — como carregam depois, "ganham" delas.
function renderAdminScreen() {
  const content = document.getElementById("adminContent");
  if (!isAdmin()) { content.innerHTML = "<p>Acesso restrito.</p>"; return; }
  content.innerHTML = `
    <button class="menu-btn menu-btn-adm" onclick="adminEditXP()"><i class="fa-solid fa-gear"></i> Editar meu XP</button>
    <button class="menu-btn menu-btn-adm" onclick="toggleAdminDayMode()"><i class="fa-solid fa-lock-open"></i> Editar dias (volte à Home depois)</button>
    <button class="menu-btn menu-btn-adm" onclick="adminGrantXP()"><i class="fa-solid fa-gift"></i> Dar XP a alguém</button>
    <button class="menu-btn menu-btn-adm" onclick="loadBugReportsInAdmin()"><i class="fa-solid fa-bug"></i> Ver Relatos de Bugs</button>
    <button class="menu-btn menu-btn-adm" onclick="openAdminBroadcastForm()"><i class="fa-solid fa-bullhorn"></i> Enviar Notificação</button>
    <button class="menu-btn menu-btn-adm" onclick="adminForceDuelExit()"><i class="fa-solid fa-hand-fist"></i> Tirar alguém do Duelo</button>
    <button class="menu-btn menu-btn-adm" onclick="adminBanPlayer()"><i class="fa-solid fa-ban"></i> Banir Jogador</button>
    <button class="menu-btn menu-btn-adm" onclick="adminUnbanPlayer()"><i class="fa-solid fa-check"></i> Desbanir Jogador</button>
    <div id="bugReportsBox"></div>
    <div id="broadcastBox"></div>
  `;
}

function adminBanPlayer() {
  if (!isAdmin()) return;
  openModal({
    title: "Senha de ADM:",
    type: "password",
    confirmLabel: "Continuar",
    onConfirm: (pass) => {
      if (pass !== ADM_PASSWORD) { showToast("❌ Senha incorreta."); return; }
      openModal({
        title: "Nickname do jogador pra banir:",
        type: "text",
        confirmLabel: "Continuar",
        onConfirm: (nick) => {
          const target = (nick || "").trim();
          if (!target) return;
          openModal({
            title: "Motivo do banimento (opcional):",
            type: "text",
            confirmLabel: "Banir",
            onConfirm: (reason) => {
              db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
                if (snap.empty) { showToast("Nickname não encontrado."); return; }
                db.collection("users").doc(snap.docs[0].id).update({ banned: true, banReason: reason || "Sem motivo especificado." }).then(() => {
                  showToast(`${target} foi banido.`);
                });
              });
            }
          });
        }
      });
    }
  });
}
// fim adminBanPlayer

function adminUnbanPlayer() {
  if (!isAdmin()) return;
  openModal({
    title: "Senha de ADM:",
    type: "password",
    confirmLabel: "Continuar",
    onConfirm: (pass) => {
      if (pass !== ADM_PASSWORD) { showToast("❌ Senha incorreta."); return; }
      openModal({
        title: "Nickname do jogador pra desbanir:",
        type: "text",
        confirmLabel: "Desbanir",
        onConfirm: (nick) => {
          const target = (nick || "").trim();
          if (!target) return;
          db.collection("users").where("nicknameLower", "==", target.toLowerCase()).limit(1).get().then(snap => {
            if (snap.empty) { showToast("Nickname não encontrado."); return; }
            db.collection("users").doc(snap.docs[0].id).update({ banned: false, banReason: "" }).then(() => {
              showToast(`${target} foi desbanido.`);
            });
          });
        }
      });
    }
  });
}
// fim adminUnbanPlayer

function checkBanStatus() {
  if (!currentUser) { hideBannedOverlay(); return; }
  db.collection("users").doc(currentUser.uid).get().then(docSnap => {
    if (docSnap.exists && docSnap.data().banned) {
      showBannedOverlay(docSnap.data().banReason || "Sem motivo especificado.");
    } else {
      hideBannedOverlay();
    }
  });
}
// fim checkBanStatus

let openTodaySubtaskBlockId = null;

function toggleTodaySubtaskBlock(id) {
  openTodaySubtaskBlockId = (openTodaySubtaskBlockId === id) ? null : id;
  renderTodaySubtasks();
}
// fim toggleTodaySubtaskBlock

function renderTodaySubtasks() {
  const box = document.getElementById("todaySubtasksBox");
  if (!box) return;

  const activeToday = activeTasksOnDate(todayKey).filter(t => t.linkedBlocks && t.linkedBlocks.length > 0);
  if (activeToday.length === 0) { box.innerHTML = ""; return; }

  const subState = (history[todayKey] && history[todayKey].subtasks) || {};
  const blockIds = [...new Set(activeToday.flatMap(t => t.linkedBlocks || []))];

  let html = `<h3><i class="fa-solid fa-list-check"></i> Subtarefas de Hoje</h3>`;

  blockIds.forEach(bid => {
    const block = subtaskBlocks.find(b => b.id === bid);
    const items = block ? (block.items || []) : [];
    if (!block || items.length === 0) return;

    const doneCount = items.filter(i => subState[i.id]).length;
    const isOpen = openTodaySubtaskBlockId === bid;

    html += `
      <div class="task-row" onclick="toggleTodaySubtaskBlock('${bid}')">
        <i class="fa-solid fa-folder"></i> ${block.name}
        <span style="font-size:10px; opacity:.7; margin-left:6px;">(${doneCount}/${items.length})</span>
        ${isOpen ? `
          <div class="task-days-row" onclick="event.stopPropagation();" style="flex-direction:column; align-items:stretch;">
            ${items.map(item => `
              <div class="friend-row" style="cursor:pointer;" onclick="toggleSubtask('${item.id}', '${todayKey}')">
                <span>${subState[item.id] ? '<i class="fa-solid fa-square-check"></i>' : '<i class="fa-regular fa-square"></i>'} ${item.name}</span>
              </div>
            `).join("")}
          </div>` : ""}
      </div>`;
  });

  box.innerHTML = html;
}
// fim renderTodaySubtasks

// ===== TREINO (Sessão, Evolução, Peso) =====
let trainingViewMode = "sessao";
let openSessionId = null;

function switchTrainingMode(mode) {
  trainingViewMode = mode;
  openSessionId = null;
  renderTrainingTabs();
  renderTrainingContent();
}
// fim switchTrainingMode

function renderTrainingTabs() {
  const box = document.getElementById("trainingModeTabs");
  if (!box) return;
  const modes = [["sessao", "Sessão", "fa-dumbbell"], ["evolucao", "Evolução", "fa-chart-line"], ["peso", "Peso", "fa-weight-scale"]];
  box.innerHTML = modes.map(([m, label, icon]) => `
    <button class="menu-btn-small" style="${trainingViewMode === m ? "opacity:1;" : "opacity:.5;"}" onclick="switchTrainingMode('${m}')"><i class="fa-solid ${icon}"></i> ${label}</button>
  `).join("");
}
// fim renderTrainingTabs

function renderTrainingContent() {
  if (trainingViewMode === "sessao") renderTrainingSessao();
  else if (trainingViewMode === "evolucao") renderTrainingEvolucao();
  else renderTrainingPeso();
}
// fim renderTrainingContent

function loadTrainingScreen() {
  trainingViewMode = "sessao";
  openSessionId = null;
  renderTrainingTabs();
  renderTrainingContent();
}
// fim loadTrainingScreen

// ----- Sessão -----
function addWorkoutSession() {
  const date = document.getElementById("newSessionDate").value || todayKey;
  const split = document.getElementById("newSessionSplit").value.trim();
  const duration = parseInt(document.getElementById("newSessionDuration").value) || 0;

  workoutSessions.push({ id: "ws" + Date.now() + Math.floor(Math.random() * 1000), date, split, duration, exercises: [] });
  saveState();
  renderTrainingSessao();
}
// fim addWorkoutSession

function deleteWorkoutSession(id) {
  openModal({
    title: "Excluir essa sessão de treino inteira?",
    type: "confirm",
    confirmLabel: "Excluir",
    onConfirm: () => {
      workoutSessions = workoutSessions.filter(s => s.id !== id);
      if (openSessionId === id) openSessionId = null;
      saveState();
      renderTrainingSessao();
    }
  });
}
// fim deleteWorkoutSession

function toggleSessionOpen(id) {
  openSessionId = (openSessionId === id) ? null : id;
  renderTrainingSessao();
}
// fim toggleSessionOpen

function addExerciseToSession(sessionId) {
  const session = workoutSessions.find(s => s.id === sessionId);
  if (!session) return;
  const nameInput = document.getElementById(`exName_${sessionId}`);
  const weightInput = document.getElementById(`exWeight_${sessionId}`);
  const repsInput = document.getElementById(`exReps_${sessionId}`);
  const setsInput = document.getElementById(`exSets_${sessionId}`);

  const name = nameInput.value.trim();
  const weight = weightInput.value.trim() === "" ? null : parseFloat(weightInput.value);
  const reps = parseInt(repsInput.value) || 0;
  const sets = parseInt(setsInput.value) || 0;
  if (!name || reps <= 0 || sets <= 0) { showToast("Preenche nome, reps e séries."); return; }

  const volume = weight !== null ? Math.round(weight * reps * sets * 10) / 10 : reps * sets;
  session.exercises.push({ id: "ex" + Date.now() + Math.floor(Math.random() * 1000), name, weight, reps, sets, volume });

  nameInput.value = ""; weightInput.value = ""; repsInput.value = ""; setsInput.value = "";
  saveState();
  renderTrainingSessao();
}
// fim addExerciseToSession

function deleteExerciseFromSession(sessionId, exId) {
  const session = workoutSessions.find(s => s.id === sessionId);
  if (!session) return;
  session.exercises = session.exercises.filter(e => e.id !== exId);
  saveState();
  renderTrainingSessao();
}
// fim deleteExerciseFromSession

function renderTrainingSessao() {
  const box = document.getElementById("trainingContent");
  const sorted = [...workoutSessions].sort((a, b) => b.date.localeCompare(a.date));

  let html = `
    <div class="task-manager">
      <h3 style="margin-top:0;">Nova sessão</h3>
      <div class="admin-form">
        <label>Data</label>
        <input type="date" id="newSessionDate" value="${todayKey}">
        <label>Divisão de treino (ex: Treino A, Push)</label>
        <input type="text" id="newSessionSplit" placeholder="Ex: Treino A">
        <label>Duração (minutos)</label>
        <input type="number" id="newSessionDuration" min="0" placeholder="Ex: 60">
        <button class="aura-btn" onclick="addWorkoutSession()"><i class="fa-solid fa-plus"></i> Criar sessão</button>
      </div>
    </div>
  `;

  if (sorted.length === 0) {
    html += `<p style="font-size:12px; opacity:.7;">Nenhuma sessão registrada ainda.</p>`;
  } else {
    sorted.forEach(session => {
      const isOpen = openSessionId === session.id;
      const totalVolume = session.exercises.reduce((sum, e) => sum + (e.volume || 0), 0);
      html += `
        <div class="task-manager">
          <div class="task-row" onclick="toggleSessionOpen('${session.id}')">
            <strong>${session.date}${session.split ? " — " + session.split : ""}</strong>
            <span style="font-size:11px; opacity:.7; margin-left:6px;">${session.duration ? session.duration + "min · " : ""}${session.exercises.length} exercício(s) · Volume: ${totalVolume}</span>
          </div>
          ${isOpen ? `
            <div style="margin-top:10px;">
              ${session.exercises.map(ex => `
                <div class="friend-row">
                  <span>${ex.name} — ${ex.weight !== null ? ex.weight + "kg x " : ""}${ex.reps}reps x ${ex.sets}séries ${ex.weight !== null ? "(vol: " + ex.volume + ")" : "(" + ex.volume + " reps totais)"}</span>
                  <button class="menu-btn-small menu-btn-danger" onclick="deleteExerciseFromSession('${session.id}','${ex.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
              `).join("")}
              <div class="admin-form" style="margin-top:10px;">
                <label>Novo exercício</label>
                <input type="text" id="exName_${session.id}" placeholder="Nome do exercício">
                <label>Peso (kg) — deixe vazio se for calistenia</label>
                <input type="number" id="exWeight_${session.id}" step="0.5" placeholder="Ex: 40 (opcional)">
                <label>Repetições</label>
                <input type="number" id="exReps_${session.id}" placeholder="Ex: 10">
                <label>Séries</label>
                <input type="number" id="exSets_${session.id}" placeholder="Ex: 3">
                <button class="aura-btn" onclick="addExerciseToSession('${session.id}')"><i class="fa-solid fa-plus"></i> Adicionar exercício</button>
              </div>
              <button class="aura-danger" style="margin-top:10px;" onclick="deleteWorkoutSession('${session.id}')"><i class="fa-solid fa-trash"></i> Excluir sessão</button>
            </div>` : ""}
        </div>`;
    });
  }

  box.innerHTML = html;
}
// fim renderTrainingSessao

// ----- Evolução -----
function computePersonalRecords() {
  const records = {};
  workoutSessions.forEach(session => {
    session.exercises.forEach(ex => {
      if (ex.weight === null) return;
      if (!records[ex.name] || ex.weight > records[ex.name].weight) {
        records[ex.name] = { weight: ex.weight, reps: ex.reps, sets: ex.sets, date: session.date };
      }
    });
  });
  return records;
}
// fim computePersonalRecords

function renderTrainingEvolucao() {
  const box = document.getElementById("trainingContent");
  const records = computePersonalRecords();
  const recordNames = Object.keys(records);

  let html = `<div class="task-manager"><h3 style="margin-top:0;"><i class="fa-solid fa-trophy"></i> Recordes Pessoais</h3>`;
  if (recordNames.length === 0) {
    html += `<p style="font-size:12px; opacity:.7;">Nenhum recorde ainda — registre exercícios com peso na aba Sessão.</p>`;
  } else {
    recordNames.forEach(name => {
      const r = records[name];
      html += `<div class="friend-row"><span>${name}</span><span>${r.weight}kg x ${r.reps} (${r.date})</span></div>`;
    });
  }
  html += `</div>`;

  const sorted = [...workoutSessions].sort((a, b) => b.date.localeCompare(a.date));
  html += `<div class="task-manager"><h3 style="margin-top:0;"><i class="fa-solid fa-chart-column"></i> Volume por Sessão</h3>`;
  if (sorted.length === 0) {
    html += `<p style="font-size:12px; opacity:.7;">Nenhuma sessão registrada ainda.</p>`;
  } else {
    sorted.slice(0, 15).forEach(session => {
      const totalVolume = session.exercises.reduce((sum, e) => sum + (e.volume || 0), 0);
      html += `<div class="friend-row"><span>${session.date}${session.split ? " — " + session.split : ""}</span><span>${totalVolume}</span></div>`;
    });
  }
  html += `</div>`;

  box.innerHTML = html;
}
// fim renderTrainingEvolucao

// ----- Peso -----
function addBodyWeightEntry() {
  const date = document.getElementById("newWeightDate").value || todayKey;
  const weight = parseFloat(document.getElementById("newWeightValue").value);
  if (!weight) { showToast("Digite um peso válido."); return; }

  bodyWeightLog.push({ id: "bw" + Date.now() + Math.floor(Math.random() * 1000), date, weight });
  document.getElementById("newWeightValue").value = "";
  saveState();
  renderTrainingPeso();
}
// fim addBodyWeightEntry

function deleteBodyWeightEntry(id) {
  bodyWeightLog = bodyWeightLog.filter(e => e.id !== id);
  saveState();
  renderTrainingPeso();
}
// fim deleteBodyWeightEntry

function renderTrainingPeso() {
  const box = document.getElementById("trainingContent");
  const sorted = [...bodyWeightLog].sort((a, b) => b.date.localeCompare(a.date));

  let html = `
    <div class="task-manager">
      <h3 style="margin-top:0;">Registrar peso</h3>
      <div class="admin-form">
        <label>Data</label>
        <input type="date" id="newWeightDate" value="${todayKey}">
        <label>Peso (kg)</label>
        <input type="number" id="newWeightValue" step="0.1" placeholder="Ex: 78.5">
        <button class="aura-btn" onclick="addBodyWeightEntry()"><i class="fa-solid fa-plus"></i> Registrar</button>
      </div>
    </div>
  `;

  if (sorted.length >= 2) {
    const delta = Math.round((sorted[0].weight - sorted[sorted.length - 1].weight) * 10) / 10;
    html += `<div class="task-manager"><p style="font-size:13px;">Variação desde o primeiro registro: <strong>${delta > 0 ? "+" : ""}${delta}kg</strong></p></div>`;
  }

  html += `<div class="task-manager"><h3 style="margin-top:0;">Histórico</h3>`;
  if (sorted.length === 0) {
    html += `<p style="font-size:12px; opacity:.7;">Nenhum registro ainda.</p>`;
  } else {
    sorted.forEach(entry => {
      html += `<div class="friend-row"><span>${entry.date}</span><span>${entry.weight}kg <button class="menu-btn-small menu-btn-danger" onclick="deleteBodyWeightEntry('${entry.id}')"><i class="fa-solid fa-trash"></i></button></span></div>`;
    });
  }
  html += `</div>`;

  box.innerHTML = html;
}
// fim renderTrainingPeso
