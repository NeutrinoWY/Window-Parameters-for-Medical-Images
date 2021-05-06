window.imageData = {};
window.chartOptions = {};
window.chartObjs=[];
window.checkName=[];
window.histSize = [8];
window.histCountRange = [1, 256];

window.wbs=[];
window.wwwl=[[163.86894,81.93436],[100,50]];
var ww = 163.86894;    
var wl = 81.93436;    
var attainedWB = get_init_conv_params_relu(wl, ww, 255.0);
window.wbs.push(attainedWB);
var defaultWB = get_init_conv_params_relu(50,100,255.0);
window.wbs.push(defaultWB);

let imageTitles = ['Original Image', 'Attained Windowed Image', 'Default Windowed Image'];
window.categrories = [];
let ranges=window.histCountRange;
let step = parseInt((ranges[1] + 1) / histSize[0]);
for (i = 1; i < 256; i += step) {
    window.categrories.push('' + i)
}

for (i = 0; i < 3; i++) {
    window.checkName[i]="";
    window.imageData[i] = {
        name: imageTitles[i],
        mat: null
    };
    window.chartObjs[i]=echarts.init(document.getElementById('hist_'+i));
    window.chartOptions[i] = {
        title: {
            text: 'Histogram of ' + imageTitles[i],
            left: 'center'
        },
        xAxis: {
            data: window.categrories 
        },
        yAxis: {},
        tooltip: {
            trigger: "axis",
            confine: true,
            enterable: true,
            axisPointer: {
                type: "shadow",
                shadowStyle: {
                    color: "rgba(0,100,100, 0.2)"
                }
            },
            formatter: function (params) {
               
               
                window.clicked = false;
                
            },
            backgroundColor: "rgba(255,255,255,1)",
            textStyle: {
                color: "#6D6D70"
            },
            extraCssText: 'box-shadow: 3px 6px 14px #cccccc61;border-radius: 10px;'
        },
        series: [{
            name: 'Series',
            type: 'bar',
            data: [],  
            showBackground: true,
            itemStyle: {
                normal: {
                    color: function (params) {
                            return '#ffbcbc';
                    }
                }
            }
        }]
    };
}



//--------------from nifti library-------------
function readNIFTI(name, data) {
    console.log("Read file: " + name)
    var niftiHeader, niftiImage;
    // parse nifti
    if (nifti.isCompressed(data)) {
        data = nifti.decompress(data);
    }
    if (nifti.isNIFTI(data)) {
        niftiHeader = nifti.readHeader(data);
        niftiImage = nifti.readImage(niftiHeader, data);
        window.niftiHeader = niftiHeader;
        window.niftiImage = niftiImage;
    }
    
}

function makeSlice(file, start, length) {
    var fileType = (typeof File);
    if (fileType === 'undefined') {
        return function () { };
    }
    if (File.prototype.slice) {
        return file.slice(start, start + length);
    }
    if (File.prototype.mozSlice) {
        return file.mozSlice(start, length);
    }
    if (File.prototype.webkitSlice) {
        return file.webkitSlice(start, length);
    }
    return null;
}

function readFile(file) {
    var blob = makeSlice(file, 0, file.size);
    var reader = new FileReader();
    reader.onloadend = function (evt) {
        if (evt.target.readyState === FileReader.DONE) {
            readNIFTI(file.name, evt.target.result);
            var slices = niftiHeader.dims[3];
            var slider = document.getElementById('myRange');
            slider.max = slices - 1;
            window.max_page_number=slices-1;
            $('#max_page').text(''+window.max_page_number);
            slider.value = Math.round(slices / 2);
            $('#page_input').val(slider.value);
            slider.oninput = function() {
                drawCanvas(canvas, slider.value, niftiHeader, niftiImage);
                $('#page_input').val(slider.value);
            };
            changeIndex();
        }
    };
    reader.readAsArrayBuffer(blob);
}

//
function getSliceImage(index, callback) {
    let cols = window.niftiHeader.dims[1];
    let rows = window.niftiHeader.dims[2];
    let typedData;

    if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT8) {
        typedData = new Uint8Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT16) {
        typedData = new Int16Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT32) {
        typedData = new Int32Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_FLOAT32) {
        typedData = new Float32Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_FLOAT64) {
        typedData = new Float64Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_INT8) {
        typedData = new Int8Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT16) {
        typedData = new Uint16Array(niftiImage);
    } else if (niftiHeader.datatypeCode === nifti.NIFTI1.TYPE_UINT32) {
        typedData = new Uint32Array(niftiImage);
    } else {
        return;
    }
    // offset to specified 2d slice
    let sliceSize = cols * rows;
    let sliceOffset = sliceSize * index;
    let sliced = Array.from(typedData.slice(sliceOffset, sliceOffset + sliceSize));

    let arr1d = nj.array(sliced, dtype = "float32");
    let maxVal = parseFloat(arr1d.max());
    arr1d = arr1d.divide(maxVal);
    arr1d = arr1d.multiply(255.0);
    let dst = Uint8Array.from(arr1d.tolist());
    let mat = cv.matFromArray(cols, rows, cv.CV_8U, dst);
    window.imageData[0].mat = mat;
    for(let i=0;i<3;i++){
        calcWindowedImage(i); // calculate and stored in window.imageData
    }
    callback();
}

function read3DImages() {
    let files = $('#fileSelector')[0].files;
    if (files.length > 0) {
        readFile(files[0]);
    } else {
        alert("Please select a file.");
    }
}

//======== Window calculation =========
function get_init_conv_params_relu(wl, ww, upbound_value=255.0){
	w = upbound_value / ww;
	b = -1. * upbound_value * (wl - ww / 2.) / ww;
	return [w,b];
}

function upbound_relu(x) { //normal array
    return x.map(a => Math.min(Math.max(a, 0), 255));
}

function calcWindowedImage(index) {
    if(index>0&&index<3){ //1 or 2
        let wb=window.wbs[index-1]; // 0 or 1
        let w = wb[0];
        let b = wb[1];
        const imgMat=window.imageData[0].mat;
        const ui8 = imgMat.data;
        let imageArr = Array.from(ui8);
        imageArr = imageArr.map(x => w * x + b);
        imageArr = upbound_relu(imageArr);
        var dst = Uint8Array.from(imageArr);
        window.imageData[index].mat=cv.matFromArray(imgMat.cols, imgMat.rows, cv.CV_8U, dst);
        let wl=window.wwwl[index-1];
        $('#wwwl_'+index).text("ww="+wl[0]+", wl="+wl[1]);
    }
}//returns an imageMat

function drawHistX(index) { // 0,1,2
    const imgMat=window.imageData[index].mat;
    let echartObj=window.chartObjs[index];
    //img -> hist arr
    let srcVec = new cv.MatVector();
    srcVec.push_back(imgMat);
    let accumulate = false;
    let channels = [0];
    let histSize = window.histSize;
    let ranges = window.histCountRange;
    let hist = new cv.Mat();
    let mask = new cv.Mat();
    // can try more different parameters
    cv.calcHist(srcVec, channels, mask, hist, histSize, ranges, accumulate);
    //hist arr -> option
    
    window.chartOptions[index].series[0].data=Array.from(hist.data32F);

    echartObj.setOption(window.chartOptions[index]);
    delete srcVec;
    delete mask;
    delete hist;
}

//=================== UI Related =======================

// run when the index on frontend is being changed
function changeIndex() {
    pagenumber = parseInt($("#page_input").val());

    if (isNaN(pagenumber) || pagenumber < 1 || pagenumber > window.max_page_number) {
        alert('Please input a valid number');
        return
    }
    //getImage(filename,pagenumber)
    //drawCanvas(canvas, pagenumber, window.niftiHeader, window.niftiImage);
    $('#myRange').val(pagenumber);
    getSliceImage(pagenumber,function(){
        for(let i=0;i<3;i++){
            drawCanvasX(i);
            drawHistX(i);
        }
    });
}

//run when right arrow been clicked
function plusOne(){
	current_page=$('#page_input').val();
	next_page=parseInt(current_page)+1
	if(next_page<window.max_page_number){
		$('#page_input').val(next_page);
		changeIndex()
	}
}

//run when left button been clicked
function minusOne(){
	current_page=$('#page_input').val();
	next_page=parseInt(current_page)-1
	if(next_page>0){
		$('#page_input').val(next_page);
		changeIndex()
	}
}

function resize(index) {
	let canvas=document.getElementById('img_'+index);
	const ratio = 0.35;
	let canvas_height =  window.innerHeight*ratio;
	let canvas_width = window.innerHeight*ratio;
	canvas.style.width = canvas_width + 'px';
	canvas.style.height = canvas_height + 'px';
}

// hist bar click callback

function whoseBarClicked(index) {
    return function barClicked(params) {
        console.log('hello');
        let pointInPixel = [params.offsetX, 0];
        let pointInGrid = window.chartObjs[index].convertFromPixel('grid', pointInPixel);
        let category = window.chartObjs[index].getModel().get('xAxis')[0].data[pointInGrid[0]]

        console.log('clicked chart['+index+']'+category);
        if (category) {
            if (category == window.checkName[index]) {
                window.checkName[index] = "";
                window.chartOptions[index]
                    .series[0]
                    .itemStyle
                    .normal
                    .color=function (params) {
                                return '#ffbcbc';
                            }
            } else {
                window.checkName[index] = category;
                window.chartOptions[index]
                    .series[0]
                    .itemStyle
                    .normal
                    .color=function (params) {
                            //set different color to the selected bar
                            if (params.name==category) {
                                return '#ff0000';
                            } else {
                                return '#ffbcbc';
                            }
                        }
                   
                
                //window.chartObjs[index].resize(); //refresh
            }
            window.chartObjs[index].setOption(window.chartOptions[index]);
            drawCanvasX(index);
        }
    }
}

function drawCanvasX(index){
    let histRanges=[...window.categrories];
    histRanges.push("255");
    let imgtoDisp=new cv.Mat();
    if(window.checkName[index]==""){
        imgtoDisp=window.imageData[index].mat;
    }else{
        let category=window.checkName[index];
        let ind=histRanges.indexOf(category);
        let lower = parseFloat(category);
        let upper=parseFloat(histRanges[ind+1]);
        const src = window.imageData[index].mat;
        //calc masked region
        let mask1=new cv.Mat();
        let mask2=new cv.Mat();
        let mask_all=new cv.Mat();
        cv.threshold(src,mask1,lower,255.0,cv.THRESH_BINARY);
        cv.threshold(src,mask2,upper,255.0,cv.THRESH_BINARY_INV);
        cv.bitwise_and(mask1,mask2,mask_all);
        
        let highlight = new cv.Mat();
        cv.bitwise_and(src,mask_all,highlight); //keep masked area
       
        
        let highlightArr=Uint8Array.from(highlight.data.map(function(x){
            if(x==0){
                return 0;
            }
            var lowerind=0
            for(i in histRanges){
                if(histRanges[i]>x){
                    lowerind=i-1;
                    break;
                }
            }
            return (histRanges[lowerind]>130)? 400-histRanges[lowerind]:256-histRanges[lowerind];
        }));
        delete highlight;
        delete mask1;
        delete mask2;
        let highlightMat=cv.matFromArray(src.cols,src.rows,cv.CV_8UC1, highlightArr);
        
        //let highlightMat=mask_all;
        let dst = new cv.Mat();
        let dtype = -1;
        let mask=new cv.Mat();
        cv.add(src, highlightMat, dst, mask, dtype); //subtract the hightlighted area half of the original value
        delete mask;
        //merge highlight and background
        let rgbaPlanes = new cv.MatVector();

        let dark=new cv.Mat();
        cv.subtract(src, highlightMat, dark, mask, dtype); //subtract the hightlighted area half of the original value
        rgbaPlanes.push_back(dst);//set brightness of green channel of hightlighted to half
        rgbaPlanes.push_back(dark);//set brightness of blue channel of hightlighted to half
        rgbaPlanes.push_back(dark);// keep red channel
        cv.merge(rgbaPlanes, imgtoDisp);
        
    }
    cv.imshow("img_"+index, imgtoDisp); //show in canvas
    resize(index);
}

$(document).ready(function () {
    window.defaultPageNumber = 80;
    $("#page_input").val(window.defaultPageNumber);
    $("#btn_upload").click(read3DImages);
    $("#btn_go").click(changeIndex);
    $("#btn_plus").click(plusOne);
    $("#btn_minus").click(minusOne);
    $(document).keydown(function (e) {
        console.log(e.keyCode);
        if (e.keyCode == 37) { //left 
            minusOne();
        } else if (e.keyCode == 39) { //right
            plusOne();
        }
    });
    $("#myRange").change(function () {
        var newval = $(this).val();
        $("#page_input").val(newval);
        changeIndex();
    });
    for (let i = 0; i < 3; i++) {
        window.chartObjs[i].getZr().on('click', whoseBarClicked(i));
    } 
});	