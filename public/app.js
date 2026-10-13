const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const currency=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const integer=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const byId=(id)=>document.getElementById(id);
let rows=[];
let selectedYear="";
let transactionSort={key:"dueDate",direction:"asc"};
function valueOf(value){return Number.isFinite(Number(value))?Number(value):0}
function income(row){return row.nature.toLocaleLowerCase("pt-BR")==="renda"}
function signedValue(row){const amount=Math.abs(valueOf(row.plannedValue));return income(row)?amount:-amount}
function isSettled(row){return Boolean(row.paidDate)||/\b(paga|pago|recebida|recebido)\b/.test(String(row.status||"").toLocaleLowerCase("pt-BR"))}
function totals(items){
  const result={income:0,expense:0,realized:0};
  for(const row of items){if(income(row))result.income+=Math.abs(valueOf(row.plannedValue));else result.expense+=Math.abs(valueOf(row.plannedValue));if(isSettled(row))result.realized+=signedValue(row)}
  result.balance=items.reduce((sum,row)=>sum+signedValue(row),0);
  return result;
}
function selectedRows(){
  const month=byId("monthFilter").value;
  return rows.filter((row)=>row.year===Number(selectedYear)&&(month==="Todos"||row.month===month));
}
function setOptions(select,items,selected){
  select.replaceChildren(...items.map((value)=>{const option=document.createElement("option");option.value=value;option.textContent=value;option.selected=value===selected;return option}));
}
function preferredMonth(year){
  const available=new Set(rows.filter((row)=>row.year===Number(year)).map((row)=>row.month));
  const current=MONTHS[new Date().getMonth()];
  return available.has(current)?current:[...MONTHS].reverse().find((month)=>available.has(month))||"Todos";
}
function renderSummary(items){
  const result=totals(items);
  byId("incomeTotal").textContent=currency.format(result.income);
  byId("expenseTotal").textContent=currency.format(result.expense);
  byId("balanceTotal").textContent=currency.format(result.balance);
  byId("realizedTotal").textContent=currency.format(result.realized);
  const period=byId("monthFilter").value==="Todos"?"Ano de "+selectedYear:byId("monthFilter").value+" de "+selectedYear;
  byId("incomeHint").textContent=period;
  byId("expenseHint").textContent=period;
}
function svg(name,attrs){
  const element=document.createElementNS("http://www.w3.org/2000/svg",name);
  for(const key of Object.keys(attrs))element.setAttribute(key,String(attrs[key]));
  return element;
}
function renderMonthlyChart(){
  const chart=byId("monthlyChart");
  const width=Math.max(520,Math.round(chart.parentElement.clientWidth||720));
  const height=245,left=42,right=10,top=13,bottom=29,plotWidth=width-left-right,plotHeight=height-top-bottom;
  const data=MONTHS.map((month)=>{const result=totals(rows.filter((row)=>row.year===Number(selectedYear)&&row.month===month));return{month:month,income:result.income,expense:result.expense}});
  const max=Math.max(1,...data.map((item)=>Math.max(item.income,item.expense)));
  const groupWidth=plotWidth/12,barWidth=Math.min(15,groupWidth*.29);
  chart.setAttribute("viewBox","0 0 "+width+" "+height);
  chart.replaceChildren();
  const title=svg("title",{});title.textContent="Receitas e despesas em "+selectedYear;chart.append(title);
  for(let step=0;step<=3;step++){
    const y=top+plotHeight-plotHeight*step/3;
    chart.append(svg("line",{x1:left,y1:y,x2:width-right,y2:y,class:"grid-line"}));
    const label=svg("text",{x:left-8,y:y+3,"text-anchor":"end",class:"axis-label"});label.textContent=step===0?"0":integer.format(max*step/3);chart.append(label);
  }
  data.forEach((item,index)=>{
    const center=left+groupWidth*index+groupWidth/2;
    const hIncome=plotHeight*item.income/max,hExpense=plotHeight*item.expense/max;
    chart.append(svg("rect",{x:center-barWidth-1,y:top+plotHeight-hIncome,width:barWidth,height:item.income?Math.max(2,hIncome):0,rx:3,class:"bar-income"}));
    chart.append(svg("rect",{x:center+1,y:top+plotHeight-hExpense,width:barWidth,height:item.expense?Math.max(2,hExpense):0,rx:3,class:"bar-expense"}));
    const label=svg("text",{x:center,y:height-8,"text-anchor":"middle",class:"month-label"});label.textContent=item.month.slice(0,3).toLocaleLowerCase("pt-BR");chart.append(label);
  });
}
function renderCategories(items){
  const target=byId("categoryChart"),totalsByCategory=new Map();
  for(const row of items){if(income(row))continue;const category=row.category.trim()||"Sem categoria";totalsByCategory.set(category,(totalsByCategory.get(category)||0)+Math.abs(valueOf(row.plannedValue)))}
  const sorted=[...totalsByCategory.entries()].sort((a,b)=>b[1]-a[1]).slice(0,7);
  target.replaceChildren();
  if(!sorted.length){const empty=document.createElement("div");empty.className="category-empty";empty.textContent="Sem despesas neste período.";target.append(empty);return}
  const largest=Math.max(...sorted.map((item)=>item[1]),1);
  for(const item of sorted){
    const line=document.createElement("div");line.className="category-item";
    const meta=document.createElement("div");meta.className="category-meta";
    const name=document.createElement("span");name.className="category-name";name.textContent=item[0];
    const amount=document.createElement("span");amount.className="category-value";amount.textContent=currency.format(item[1]);
    const track=document.createElement("div");track.className="category-track";
    const fill=document.createElement("div");fill.className="category-fill";fill.style.width=Math.max(3,item[1]/largest*100)+"%";
    meta.append(name,amount);track.append(fill);line.append(meta,track);target.append(line);
  }
}
function annualState(row){
  const status=String(row.status||"").toLocaleLowerCase("pt-BR");
  if(/proje|previs|previst|estimad/.test(status)||row.projected===true)return"projected";
  const amount=valueOf(row.plannedValue),due=String(row.dueDate||"");
  const pastDue=/^\d{4}-\d{2}-\d{2}$/.test(due)&&due<new Date().toISOString().slice(0,10);
  if(isSettled(row)||/\b(zerado|zerada)\b/.test(status)||(pastDue&&amount===0))return"paid";
  if(status.includes("atras")||status.includes("vencid")||pastDue)return"overdue";
  return"open";
}
function combinedState(items){
  const states=items.map(annualState);
  if(states.includes("overdue"))return"overdue";
  if(states.includes("projected"))return"projected";
  if(states.length&&states.every((state)=>state==="paid"))return"paid";
  return"open";
}
function annualValueCell(items){
  const cell=document.createElement("td");cell.className="annual-value";
  const amount=items.reduce((sum,row)=>sum+valueOf(row.plannedValue),0);
  cell.textContent=currency.format(amount);
  if(items.length)cell.classList.add("annual-"+combinedState(items));
  return cell;
}
function renderAnnualCategories(){
  const body=byId("annualCategories"),empty=byId("annualEmpty"),year=Number(selectedYear);
  const expenses=rows.filter((row)=>row.year===year&&!income(row));
  const grouped=new Map();
  for(const row of expenses){
    const category=String(row.category||"").trim()||"Sem categoria";
    if(!grouped.has(category))grouped.set(category,[]);
    grouped.get(category).push(row);
  }
  const categories=[...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0],"pt-BR"));
  body.replaceChildren();
  byId("annualSubtitle").textContent="Detalhamento por categoria · "+selectedYear+" · ano completo";
  byId("annualCount").textContent=integer.format(expenses.length)+(expenses.length===1?" despesa":" despesas");
  empty.hidden=categories.length!==0;
  for(const [index,[category,categoryRows]] of categories.entries()){
    const groupId="annual-items-"+index;
    const categoryRow=document.createElement("tr");categoryRow.className="annual-category-row";
    const nameCell=document.createElement("th");nameCell.scope="row";
    const toggle=document.createElement("button");toggle.type="button";toggle.className="annual-toggle";toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-controls",groupId);toggle.textContent=category;
    toggle.addEventListener("click",()=>{
      const expanded=toggle.getAttribute("aria-expanded")==="true";
      toggle.setAttribute("aria-expanded",String(!expanded));
      for(const detail of body.querySelectorAll('[data-parent="'+groupId+'"]'))detail.hidden=expanded;
    });
    nameCell.append(toggle);categoryRow.append(nameCell);
    for(const month of MONTHS)categoryRow.append(annualValueCell(categoryRows.filter((row)=>row.month===month)));
    categoryRow.append(annualValueCell(categoryRows));body.append(categoryRow);

    const details=[...categoryRows].sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||""))||String(a.description||"").localeCompare(String(b.description||""),"pt-BR"));
    for(const row of details){
      const detailRow=document.createElement("tr");detailRow.className="annual-detail-row";detailRow.dataset.parent=groupId;detailRow.hidden=true;
      const description=document.createElement("th");description.scope="row";description.textContent=String(row.description||"Sem descrição");detailRow.append(description);
      for(const month of MONTHS)detailRow.append(annualValueCell(row.month===month?[row]:[]));
      detailRow.append(annualValueCell([row]));body.append(detailRow);
    }
  }
}
function dateLabel(value){
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match?match[3]+"/"+match[2]+"/"+match[1]:(value||"—");
}
function statusClass(status){
  const text=status.toLocaleLowerCase("pt-BR");
  if(/\b(pago|paga|pagos|pagas|recebido|recebida|quitado|quitada)\b/.test(text))return"status-paid";
  if(text.includes("atras")||text.includes("vencid"))return"status-late";
  if(text.includes("a pagar")||text.includes("a receber"))return"status-pending";
  return"";
}
function shortMonthDate(value){
  const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const abbreviations=["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return match?abbreviations[Number(match[2])-1]+"/"+match[1]:String(value||"");
}
function paydayItemState(row,incomeRow){
  const dueDate=String(row.dueDate||""),paidDate=String(row.paidDate||"");
  const validDue=/^\d{4}-\d{2}-\d{2}$/.test(dueDate),validPaid=/^\d{4}-\d{2}-\d{2}$/.test(paidDate);
  const settled=isSettled(row),rawStatus=String(row.status||"").toLocaleLowerCase("pt-BR");
  if(settled&&validDue&&validPaid&&paidDate>dueDate){
    const action=incomeRow?"recebida":"paga";
    return{className:"status-paid",note:(incomeRow?"Recebida":"Paga")+" com atraso · venceu em "+shortMonthDate(dueDate)+", "+action+" em "+shortMonthDate(paidDate)};
  }
  const today=new Date(),todayLocal=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
  const overdue=!settled&&((validDue&&dueDate<todayLocal)||rawStatus.includes("atras")||rawStatus.includes("vencid"));
  if(overdue)return{className:"status-late",note:validDue?(incomeRow?"A receber atrasada · prevista para ":"Vencida · venceu em ")+shortMonthDate(dueDate):(incomeRow?"A receber atrasada":"Vencida")};
  return{className:settled?"status-paid":(statusClass(String(row.status||""))||"status-pending"),note:""};
}
function sumPlanned(items){return items.reduce((sum,row)=>sum+Math.abs(valueOf(row.plannedValue)),0)}
function progressText(done,total,incomeSide){
  const remaining=Math.max(0,total-done);
  const completedLabel=incomeSide?"Já entrou: ":"Já saiu: ";
  const remainingLabel=incomeSide?"Falta entrar: ":"Falta pagar: ";
  return completedLabel+currency.format(done)+(remaining>0?" · "+remainingLabel+currency.format(remaining):"");
}
function appendPaydayItem(list,row,incomeRow){
  const state=paydayItemState(row,incomeRow);
  const item=document.createElement("li");item.className=("payday-item "+state.className).trim();
  const info=document.createElement("div");info.className="payday-item-info";
  const description=document.createElement("strong");description.textContent=String(row.description||"Sem descrição");
  if(state.note){const note=document.createElement("span");note.className="payday-item-note";note.textContent=state.note;info.append(description,note)}else info.append(description);
  const amount=document.createElement("strong");amount.className="payday-item-amount "+(incomeRow?"payday-amount-in":"payday-amount-out");amount.textContent=currency.format(Math.abs(valueOf(row.plannedValue)));
  item.append(info,amount);list.append(item);
}
function renderPaydaySummary(items){
  const month=byId("monthFilter").value;
  byId("paydayPeriod").textContent=month==="Todos"?"Ano completo · selecione um mês para ver cada quinzena":month+" de "+selectedYear;
  const validDays=new Set(["Dia 15","Dia 01"]);
  const unassigned=items.filter((row)=>!validDays.has(String(row.paycheckDay||"").trim()));
  const warning=byId("paydayUnassigned");
  warning.hidden=unassigned.length===0;
  warning.textContent=unassigned.length?integer.format(unassigned.length)+(unassigned.length===1?" lançamento está":" lançamentos estão")+" sem dia do salário. Na planilha, escolha Dia 15 ou Dia 01 em “Pagar com salário”.":"";
  for(const card of document.querySelectorAll(".payday-card")){
    const day=card.dataset.payday;
    const assigned=items.filter((row)=>String(row.paycheckDay||"").trim()===day);
    const incomes=assigned.filter(income),expenses=assigned.filter((row)=>!income(row));
    const incomeTotal=sumPlanned(incomes),expenseTotal=sumPlanned(expenses);
    const received=sumPlanned(incomes.filter(isSettled)),paid=sumPlanned(expenses.filter(isSettled));
    card.querySelector(".payday-income-total").textContent=currency.format(incomeTotal);
    card.querySelector(".payday-expense-total").textContent=currency.format(expenseTotal);
    card.querySelector(".payday-income-progress").textContent=progressText(received,incomeTotal,true);
    card.querySelector(".payday-expense-progress").textContent=progressText(paid,expenseTotal,false);
    const result=incomeTotal-expenseTotal,resultBox=card.querySelector(".payday-result");
    resultBox.classList.remove("is-short","is-covered","is-balanced");
    const resultLabel=card.querySelector(".payday-result-label"),resultValue=card.querySelector(".payday-result-value"),resultDetail=card.querySelector(".payday-result-detail");
    if(!assigned.length){
      resultBox.classList.add("is-balanced");resultLabel.textContent="Sem lançamentos neste salário";resultValue.textContent=currency.format(0);resultDetail.textContent="Marque Dia 15 ou Dia 01 na coluna “Pagar com salário”.";
    }else if(result<-.005){
      resultBox.classList.add("is-short");resultLabel.textContent="Falta prevista para pagar as contas";resultValue.textContent=currency.format(Math.abs(result));resultDetail.textContent="As entradas previstas não cobrem todas as contas.";
    }else if(result>.005){
      resultBox.classList.add("is-covered");resultLabel.textContent="Sobra prevista depois das contas";resultValue.textContent=currency.format(result);resultDetail.textContent="As entradas previstas cobrem as contas desta quinzena.";
    }else{
      resultBox.classList.add("is-balanced");resultLabel.textContent="O dinheiro fica certinho";resultValue.textContent=currency.format(0);resultDetail.textContent="O que entra cobre exatamente o total das contas.";
    }
    const incomeList=card.querySelector(".payday-income-list"),expenseList=card.querySelector(".payday-expense-list");
    incomeList.replaceChildren();expenseList.replaceChildren();
    [...incomes].sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||""))).forEach((row)=>appendPaydayItem(incomeList,row,true));
    [...expenses].sort((a,b)=>String(a.dueDate||"").localeCompare(String(b.dueDate||""))).forEach((row)=>appendPaydayItem(expenseList,row,false));
    card.querySelector(".payday-income-count").textContent=integer.format(incomes.length);
    card.querySelector(".payday-expense-count").textContent=integer.format(expenses.length);
    card.querySelector(".payday-empty-income").hidden=incomes.length!==0;
    card.querySelector(".payday-empty-expense").hidden=expenses.length!==0;
  }
}
function renderTransactions(items){
  const body=byId("transactions");
  const collator=new Intl.Collator("pt-BR",{sensitivity:"base",numeric:true});
  const getSortValue=(row)=>{
    if(transactionSort.key==="plannedValue")return Math.abs(valueOf(row.plannedValue));
    return String(row[transactionSort.key]??"").trim();
  };
  const ordered=items.map((row,index)=>({row,index})).sort((a,b)=>{
    const left=getSortValue(a.row),right=getSortValue(b.row);
    const leftEmpty=left==="",rightEmpty=right==="";
    if(leftEmpty||rightEmpty)return leftEmpty===rightEmpty?a.index-b.index:(leftEmpty?1:-1);
    const comparison=transactionSort.key==="plannedValue"?left-right:collator.compare(left,right);
    return (transactionSort.direction==="asc"?comparison:-comparison)||a.index-b.index;
  }).map((item)=>item.row);
  for(const button of document.querySelectorAll(".table-sort")){
    const active=button.dataset.sortKey===transactionSort.key;
    const heading=button.closest("th");
    heading.setAttribute("aria-sort",active?(transactionSort.direction==="asc"?"ascending":"descending"):"none");
    button.querySelector("span").textContent=active?(transactionSort.direction==="asc"?"↑":"↓"):"↕";
  }
  body.replaceChildren();
  byId("rowCount").textContent=integer.format(ordered.length)+(ordered.length===1?" lançamento":" lançamentos");
  byId("emptyState").hidden=ordered.length!==0;
  body.closest(".table-scroll").hidden=ordered.length===0;
  for(const row of ordered.slice(0,100)){
    const tr=document.createElement("tr");
    const description=document.createElement("td");description.className="description";description.textContent=row.description;
    const category=document.createElement("td");category.textContent=row.category||"—";
    const nature=document.createElement("td");const tag=document.createElement("span");tag.className="nature";tag.textContent=row.nature;nature.append(tag);
    const due=document.createElement("td");due.textContent=dateLabel(row.dueDate);
    const status=document.createElement("td");const statusTag=document.createElement("span");statusTag.className=("status "+statusClass(row.status)).trim();statusTag.textContent=row.status||"Sem situação";status.append(statusTag);
    const amount=document.createElement("td");amount.className="amount-cell "+(income(row)?"amount-income":"amount-expense");amount.textContent=currency.format(Math.abs(valueOf(row.plannedValue)));
    tr.append(description,category,nature,due,status,amount);body.append(tr);
  }
}
function render(){
  const filtered=selectedRows();
  renderSummary(filtered);renderPaydaySummary(filtered);renderMonthlyChart();renderCategories(filtered);renderAnnualCategories();renderTransactions(filtered);
}
async function loadFinance(forceRefresh=false){
  const button=byId("refreshButton"),status=byId("refreshStatus");
  if(forceRefresh){button.disabled=true;status.textContent="Atualizando…"}
  try{
    const response=await fetch(forceRefresh?"/api/finance?refresh=1":"/api/finance",{cache:"no-store",headers:{Accept:"application/json"}});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||"Não foi possível carregar a base.");
    const refreshedRows=result.rows||[];
    if(!refreshedRows.length)throw new Error("A aba Base financeira não tem lançamentos preenchidos.");
    const previousYear=selectedYear,previousMonth=byId("monthFilter").value;
    rows=refreshedRows;
    const years=[...new Set(rows.map((row)=>row.year).filter(Boolean))].sort((a,b)=>b-a).map(String);
    selectedYear=years.includes(previousYear)?previousYear:years[0];
    setOptions(byId("yearFilter"),years,selectedYear);
    const months=["Todos",...MONTHS];
    const monthSelection=months.includes(previousMonth)?previousMonth:preferredMonth(selectedYear);
    setOptions(byId("monthFilter"),months,monthSelection);
    const updatedAt=result.updatedAt?new Date(result.updatedAt):null;
    const validUpdatedAt=updatedAt&&!Number.isNaN(updatedAt.getTime());
    byId("updatedAt").textContent=validUpdatedAt
      ?new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium",timeStyle:"short"}).format(updatedAt)
      :"Prévia local";
    byId("loading").hidden=true;byId("error").hidden=true;byId("dashboard").hidden=false;render();
    if(forceRefresh){
      status.textContent=result.source==="local-snapshot"
        ?"Prévia local: cópia da planilha. Atualização direta exige OAuth no servidor."
        :(validUpdatedAt?"Planilha atualizada às "+new Intl.DateTimeFormat("pt-BR",{timeStyle:"short"}).format(updatedAt)+".":"Dados atualizados.");
    }
  }catch(error){
    if(forceRefresh){status.textContent="Não foi possível atualizar a planilha. Os dados anteriores continuam visíveis."}
    else{byId("loading").hidden=true;byId("error").textContent=error.message||"Não foi possível carregar o dashboard.";byId("error").hidden=false}
  }finally{button.disabled=false}
}
byId("yearFilter").addEventListener("change",(event)=>{selectedYear=event.target.value;setOptions(byId("monthFilter"),["Todos",...MONTHS],preferredMonth(selectedYear));render()});
byId("monthFilter").addEventListener("change",render);
for(const button of document.querySelectorAll(".table-sort"))button.addEventListener("click",()=>{
  const key=button.dataset.sortKey;
  transactionSort=key===transactionSort.key
    ?{key,direction:transactionSort.direction==="asc"?"desc":"asc"}
    :{key,direction:"asc"};
  renderTransactions(selectedRows());
});
window.addEventListener("resize",()=>{if(!byId("dashboard").hidden)renderMonthlyChart()});
byId("refreshButton").addEventListener("click",()=>loadFinance(true));
loadFinance(false);
