let stockData = [];


async function downloadHistory()
{

let symbol =
document.getElementById("symbol").value;


let fromdate =
document.getElementById("fromdate").value;


let todate =
document.getElementById("todate").value;



document.getElementById("status").innerHTML =
"Downloading " + symbol;



let url =
"https://nasdaq-historical-api.vercel.app/api/historical"
+
"?symbol=" + symbol
+
"&fromdate=" + fromdate
+
"&todate=" + todate;



let response =
await fetch(url);



stockData =
await response.json();



let html =
"<table>";



html +=
"<tr>"
+
"<th>Date</th>"
+
"<th>Close</th>"
+
"<th>Volume</th>"
+
"<th>Open</th>"
+
"<th>High</th>"
+
"<th>Low</th>"
+
"</tr>";



stockData.forEach(row=>{


html +=
"<tr>"
+
"<td>"+row.date+"</td>"
+
"<td>"+row.close+"</td>"
+
"<td>"+row.volume+"</td>"
+
"<td>"+row.open+"</td>"
+
"<td>"+row.high+"</td>"
+
"<td>"+row.low+"</td>"
+
"</tr>";

});


html += "</table>";


document.getElementById("result").innerHTML =
html;


document.getElementById("status").innerHTML =
"Completed: " + stockData.length + " records";

}



function exportExcel()
{

let table =
document.querySelector("table");


if(!table)
{
alert("Download data first");
return;
}


let blob =
new Blob(
[
table.outerHTML
],
{
type:
"application/vnd.ms-excel"
}
);


let link =
document.createElement("a");


link.href =
URL.createObjectURL(blob);


let symbol =
document.getElementById("symbol").value;


link.download =
symbol+"_Historical.xls";


link.click();

}