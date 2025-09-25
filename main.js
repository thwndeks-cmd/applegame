/** Game constants */
const COLS = 15; // x
const ROWS = 8;  // y
const CELL = 56; // cell pitch (includes gap)
const BOARD_W = 840; // from CSS
const BOARD_H = 480;

/** State */
let boardState = []; // 2D array of numbers or null (removed)
let timeLeft = 60;
let score = 0;
let timerId = null;
let isPlaying = false;

/** DOM */
const elBoard = document.getElementById('board');
const elScore = document.getElementById('score');
const elTime = document.getElementById('time');
const elStatus = document.getElementById('status');
const elDragRect = document.getElementById('drag-rect');
const elTimeFill = document.getElementById('time-fill');
const introDialog = document.getElementById('intro-dialog');
const endDialog = document.getElementById('end-dialog');
const finalScore = document.getElementById('final-score');
const startScreen = document.getElementById('start-screen');
const gameWrap = document.getElementById('game-wrap');
const btnPlay = document.getElementById('btn-play');
const bgm = document.getElementById('bgm');

function playBgm(){
  if(!bgm) return;
  bgm.volume = 0.6;
  const p = bgm.play();
  if(p && typeof p.then === 'function'){
    p.catch(()=>{});
  }
}
function pauseBgm(){
  if(!bgm) return;
  try{ bgm.pause(); }catch(_e){}
}

document.getElementById('btn-restart').addEventListener('click',()=>{ restart(); playBgm(); });
document.getElementById('play-again').addEventListener('click',()=>{
  endDialog.close();
  restart();
  playBgm();
});

function initBoard() {
  boardState = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => Math.floor(Math.random()*9)+1)
  );
  renderBoard();
}

function renderBoard(){
  elBoard.innerHTML = '';
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const v = boardState[r][c];
      const cell = document.createElement('div');
      cell.className = 'cell'+(v===null?' transparent':'');
      cell.dataset.row = r;
      cell.dataset.col = c;
      // 네이티브 드래그 비활성화
      cell.draggable = false;
      cell.style.left = (c* (BOARD_W/COLS)) + 'px';
      cell.style.top = (r* (BOARD_H/ROWS)) + 'px';
      cell.style.width = (BOARD_W/COLS) + 'px';
      cell.style.height = (BOARD_H/ROWS) + 'px';
      if(v!==null){
        const apple = document.createElement('div');
        apple.className = 'apple';
        // 네이티브 드래그 비활성화
        apple.draggable = false;
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = v;
        apple.appendChild(label);
        cell.appendChild(apple);
      }
      elBoard.appendChild(cell);
    }
  }
  // drag-rect가 보드 내부에 존재해야 하므로 재부착
  if(elDragRect && !elDragRect.parentElement){
    elBoard.appendChild(elDragRect);
  } else if(elDragRect && elDragRect.parentElement !== elBoard){
    elBoard.appendChild(elDragRect);
  }
}

// Drag selection
let dragStart = null; // {x,y}
let dragActive = false;
let selectedSet = new Set(); // of key "r,c"

function getBoardRect(){
  return elBoard.getBoundingClientRect();
}

function key(r,c){ return r+','+c; }

function clearSelection(){
  selectedSet.forEach(k=>{
    const [r,c] = k.split(',').map(Number);
    const cell = queryCell(r,c);
    if(cell) cell.classList.remove('selected');
  });
  selectedSet.clear();
}

function queryCell(r,c){
  return elBoard.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
}

function rectFromPoints(a,b){
  const x = Math.min(a.x,b.x);
  const y = Math.min(a.y,b.y);
  const w = Math.abs(a.x-b.x);
  const h = Math.abs(a.y-b.y);
  return {x,y,w,h};
}

function intersectsCell(rect, cellRect){
  // rect: in client coords, cellRect: DOMRect (client coords). Use inclusive edges.
  return !(rect.x>cellRect.right || rect.x+rect.w<cellRect.left || rect.y>cellRect.bottom || rect.y+rect.h<cellRect.top);
}

function onMouseDown(e){
  if(!isPlaying) return;
  // 요소 자체 드래그/텍스트 선택 방지
  e.preventDefault();
  const b = getBoardRect();
  dragStart = { x: e.clientX, y: e.clientY };
  dragActive = true;
  clearSelection();
  elDragRect.classList.remove('hidden');
  elDragRect.style.left = (dragStart.x - b.left) + 'px';
  elDragRect.style.top = (dragStart.y - b.top) + 'px';
  elDragRect.style.width = '0px';
  elDragRect.style.height = '0px';
  // Update once immediately so click-start area is included
  onMouseMove(e);
  // Force-include the cell under the click start (for zero-drag clicks)
  const startCol = Math.floor((dragStart.x - b.left) / (BOARD_W / COLS));
  const startRow = Math.floor((dragStart.y - b.top) / (BOARD_H / ROWS));
  if(startRow>=0 && startRow<ROWS && startCol>=0 && startCol<COLS && boardState[startRow][startCol]!==null){
    const k = key(startRow,startCol);
    selectedSet.add(k);
    const cell = queryCell(startRow,startCol);
    if(cell) cell.classList.add('selected');
    updateStatus();
  }
}

function onMouseMove(e){
  if(!dragActive) return;
  const b = getBoardRect();
  const cur = { x: e.clientX, y: e.clientY };
  const rect = rectFromPoints(dragStart, cur);
  // ensure the drag rectangle visually matches the mouse movement exactly
  elDragRect.style.left = (rect.x - b.left) + 'px';
  elDragRect.style.top = (rect.y - b.top) + 'px';
  elDragRect.style.width = rect.w + 'px';
  elDragRect.style.height = rect.h + 'px';

  // Update selection set (client-space intersection test)
  clearSelection();
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(boardState[r][c]===null) continue; // empty hole
      const cell = queryCell(r,c);
      const cr = cell.getBoundingClientRect();
      if(intersectsCell(rect, cr)){
        selectedSet.add(key(r,c));
        cell.classList.add('selected');
      }
    }
  }
  updateStatus();
}

function onMouseUp(){
  if(!dragActive) return;
  dragActive = false;
  elDragRect.classList.add('hidden');
  // Check rule
  const picked = [...selectedSet].map(k=>k.split(',').map(Number));
  const sum = picked.reduce((acc,[r,c])=>acc + (boardState[r][c]||0),0);
  if(sum===10 && picked.length>0){
    // remove
    picked.forEach(([r,c])=>{
      boardState[r][c] = null;
      const cell = queryCell(r,c);
      if(cell){
        cell.classList.add('transparent');
        cell.classList.remove('selected');
        cell.innerHTML = '';
      }
    });
    score += picked.length;
    elScore.textContent = String(score);

    // 점수 팝업 표시: 선택 영역의 중앙 근사 위치에 표시
    try{
      const b = getBoardRect();
      const xs = picked.map(([r,c])=> (c + 0.5) * (BOARD_W / COLS));
      const ys = picked.map(([r,c])=> (r + 0.5) * (BOARD_H / ROWS));
      const cx = xs.reduce((a,v)=>a+v,0)/xs.length;
      const cy = ys.reduce((a,v)=>a+v,0)/ys.length;
      const float = document.createElement('div');
      float.className = 'score-float';
      float.textContent = `+${picked.length}`;
      float.style.left = cx + 'px';
      float.style.top = cy + 'px';
      // 보드에 붙여 절대좌표 기준 동일화
      elBoard.appendChild(float);
      // 애니메이션 종료 후 제거 (~0.9s)
      setTimeout(()=>{ float.remove(); }, 950);
    }catch(_e){}

    // 타이머 연장: 예시 규칙 적용
    // 3개로 점수 합 10 → +2초, 4개 이상으로 점수 합 10 → +5초
    let bonus = 0;
    if(picked.length === 3) bonus = 2;
    else if(picked.length >= 4) bonus = 5;
    if(bonus>0){
      timeLeft = Math.min(999, timeLeft + bonus);
      elTime.textContent = String(timeLeft);
      if(elTimeFill){
        const ratio = Math.max(0, Math.min(1, timeLeft / 60));
        elTimeFill.style.height = (ratio * 100) + '%';
      }
    }
  }
  // Clear selection regardless
  clearSelection();
  updateStatus();
}

function updateStatus(){
  const count = selectedSet.size;
  const sum = [...selectedSet].reduce((acc,k)=>{
    const [r,c] = k.split(',').map(Number);
    return acc + (boardState[r][c]||0);
  },0);
  elStatus.textContent = `상태:${isPlaying?'playing':'stopped'}  시간:${timeLeft}s  점수:${score}  선택:${count}개 합:${sum}`;
}

function startTimer(){
  clearInterval(timerId);
  timeLeft = 60;
  elTime.textContent = String(timeLeft);
  if(elTimeFill){ elTimeFill.style.height = '100%'; }
  timerId = setInterval(()=>{
    if(timeLeft<=0){
      clearInterval(timerId);
      isPlaying = false;
      finalScore.textContent = String(score);
      endDialog.showModal();
      pauseBgm();
      updateStatus();
      return;
    }
    timeLeft -= 1;
    elTime.textContent = String(timeLeft);
    // Update vertical time bar height
    if(elTimeFill){
      const ratio = Math.max(0, Math.min(1, timeLeft / 60));
      elTimeFill.style.height = (ratio * 100) + '%';
    }
  },1000);
}

function restart(){
  score = 0;
  elScore.textContent = '0';
  isPlaying = true;
  initBoard();
  startTimer();
  updateStatus();
}

// Mouse listeners on board area
elBoard.addEventListener('mousedown', onMouseDown);
// 요소가 드래그되어 이동/고스트 이미지가 생기는 것을 전역 차원에서 방지
elBoard.addEventListener('dragstart', (e)=>{ e.preventDefault(); });
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mouseup', onMouseUp);

// Kickoff on load
window.addEventListener('load', ()=>{
  initBoard();
  // Start with start screen visible
  if(startScreen && gameWrap){
    startScreen.classList.remove('hidden');
    gameWrap.classList.add('hidden');
  }
});

if(btnPlay){
  btnPlay.addEventListener('click', ()=>{
    if(startScreen && gameWrap){
      startScreen.classList.add('hidden');
      gameWrap.classList.remove('hidden');
    }
    restart();
    playBgm();
  });
}

// Start game when intro dialog is closed (first start)
introDialog.addEventListener('close', ()=>{});



