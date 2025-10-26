// 全局变量
let pyodide;
let stripePlot, intensityPlot;

// 初始化函数
async function initializeApp() {
    try {
        // 显示加载提示
        document.getElementById('loading').style.display = 'flex';
        
        // 加载 Pyodide
        console.log('正在加载 Pyodide...');
        pyodide = await loadPyodide();
        
        // 安装 NumPy
        console.log('正在安装 NumPy...');
        await pyodide.loadPackage("numpy");
        
        // 隐藏加载提示
        document.getElementById('loading').style.display = 'none';
        
        console.log('Pyodide 加载完成！');
        
        // 初始化图表
        initializePlots();
        
        // 设置事件监听器
        setupEventListeners();
        
        // 初始计算
        updatePlots();
        
    } catch (error) {
        console.error('初始化失败:', error);
        document.getElementById('loading').innerHTML = 
            '<p>加载失败，请刷新页面重试</p><p>错误信息: ' + error.message + '</p>';
    }
}

// 初始化图表
function initializePlots() {
    // 干涉条纹图
    stripePlot = document.getElementById('stripe-plot');
    Plotly.newPlot(stripePlot, [{
        z: [[]],
        type: 'heatmap',
        colorscale: 'Gray',
        showscale: false
    }], {
        title: '杨氏双缝干涉条纹（竖直方向）',
        xaxis: { title: '屏幕x坐标 (m)' },
        yaxis: { title: '屏幕y坐标 (m)' },
        margin: { l: 60, r: 40, t: 60, b: 60 }
    });

    // 光强分布图
    intensityPlot = document.getElementById('intensity-plot');
    Plotly.newPlot(intensityPlot, [{
        x: [],
        y: [],
        type: 'scatter',
        mode: 'lines',
        line: { color: 'blue', width: 3 }
    }], {
        title: '光强分布曲线',
        xaxis: { title: '屏幕x坐标 (m)' },
        yaxis: { title: '相对光强', range: [-0.1, 4.1] },
        margin: { l: 60, r: 40, t: 60, b: 60 },
        showlegend: false
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 滑块事件
    const sliders = ['d-slider', 'L-slider', 'lambda-slider', 'bandwidth-slider'];
    sliders.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(sliderId.replace('-slider', '-value'));
        
        // 显示当前值
        updateSliderValue(slider, valueSpan);
        
        // 滑块变化事件
        slider.addEventListener('input', () => {
            updateSliderValue(slider, valueSpan);
            updatePlots();
        });
    });

    // 重置按钮事件
    document.getElementById('reset-button').addEventListener('click', resetParameters);
}

// 更新滑块显示值
function updateSliderValue(slider, valueSpan) {
    const unitMap = {
        'd-value': 'mm',
        'L-value': 'm',
        'lambda-value': 'nm',
        'bandwidth-value': 'nm'
    };
    const unit = unitMap[valueSpan.id];
    valueSpan.textContent = `${slider.value} ${unit}`;
}

// 重置参数
function resetParameters() {
    document.getElementById('d-slider').value = 0.5;
    document.getElementById('L-slider').value = 2.0;
    document.getElementById('lambda-slider').value = 632;
    document.getElementById('bandwidth-slider').value = 0;
    
    // 更新显示值
    updateSliderValue(document.getElementById('d-slider'), document.getElementById('d-value'));
    updateSliderValue(document.getElementById('L-slider'), document.getElementById('L-value'));
    updateSliderValue(document.getElementById('lambda-slider'), document.getElementById('lambda-value'));
    updateSliderValue(document.getElementById('bandwidth-slider'), document.getElementById('bandwidth-value'));
    
    updatePlots();
}

// 更新图表
async function updatePlots() {
    if (!pyodide) return;
    
    try {
        // 获取参数值
        const d = parseFloat(document.getElementById('d-slider').value) * 1e-3; // 转换为米
        const L = parseFloat(document.getElementById('L-slider').value);
        const wavelength = parseFloat(document.getElementById('lambda-slider').value) * 1e-9; // 转换为米
        const bandwidth = parseFloat(document.getElementById('bandwidth-slider').value) * 1e-9; // 转换为米
        
        // 在 Python 环境中执行计算
        const result = await pyodide.runPythonAsync(`
import numpy as np

def calculate_intensity(d, L, wavelength, bandwidth):
    """计算双缝干涉光强分布及明纹位置"""
    x = np.linspace(-0.1, 0.1, 1000)  # 屏幕x坐标（米）
    theta = np.arctan(x / L)  # 光线与法线夹角

    if bandwidth == 0:
        # 理想单色光
        intensity = 4 * np.cos(np.pi * d * np.sin(theta) / wavelength) ** 2
    else:
        # 非单色光（叠加带宽内的波长）
        wavelengths = np.linspace(wavelength - bandwidth / 2, wavelength + bandwidth / 2, 5)
        total_intensity = np.zeros_like(x)
        for lam in wavelengths:
            total_intensity += 4 * np.cos(np.pi * d * np.sin(theta) / lam) ** 2
        intensity = total_intensity / len(wavelengths)

    # 计算条纹间距△x（理论值：△x = λL/d）
    delta_x = (wavelength * L) / d if d != 0 else 0

    # 计算明纹位置（k=0,±1,±2,...）及序号
    k_max = int(0.08 / delta_x) if delta_x != 0 else 3  # 限制标注数量
    k_values = np.arange(-k_max, k_max + 1)
    bright_positions = (k_values * wavelength * L) / d  # 明纹位置公式：x = kλL/d
    # 过滤超出显示范围的明纹
    valid_mask = (bright_positions >= x.min()) & (bright_positions <= x.max())
    bright_positions = bright_positions[valid_mask]
    k_values = k_values[valid_mask]

    return {
        'x': x.tolist(),
        'intensity': intensity.tolist(),
        'delta_x': delta_x,
        'bright_positions': bright_positions.tolist(),
        'k_values': k_values.tolist()
    }

result = calculate_intensity(${d}, ${L}, ${wavelength}, ${bandwidth})
result
`);

        // 解析结果
        const data = result.toJs();
        const x = data.get('x');
        const intensity = data.get('intensity');
        const delta_x = data.get('delta_x');
        const bright_positions = data.get('bright_positions');
        const k_values = data.get('k_values');
        
        // 计算单色性参数
        const monochromaticity = (bandwidth / wavelength) || 0;
        
        // 更新干涉条纹图
        const y = Array.from({length: 100}, (_, i) => i * 0.001);
        const intensity_2d = y.map(() => intensity);
        
        Plotly.update(stripePlot, {
            z: [intensity_2d],
            x: x,
            y: y
        }, {}, 0);
        
        // 更新光强分布图
        Plotly.update(intensityPlot, {
            x: [x],
            y: [intensity]
        }, {}, 0);
        
        // 添加明纹标注
        addBrightFringeAnnotations(stripePlot, intensityPlot, bright_positions, k_values);
        
        // 更新参数显示
        updateParameterDisplay(d, L, wavelength, bandwidth, delta_x, monochromaticity);
        
    } catch (error) {
        console.error('计算错误:', error);
    }
}

// 添加明纹标注
function addBrightFringeAnnotations(stripePlotElement, intensityPlotElement, positions, kValues) {
    // 清除现有标注
    Plotly.relayout(stripePlotElement, { annotations: [] });
    Plotly.relayout(intensityPlotElement, { annotations: [] });
    
    // 添加新标注
    const stripeAnnotations = [];
    const intensityAnnotations = [];
    
    for (let i = 0; i < positions.length; i++) {
        const x = positions[i];
        const k = kValues[i];
        const labelText = k === 0 ? 'k=0 (中央明纹)' : `k=${k}`;
        
        // 干涉条纹图标注
        stripeAnnotations.push({
            x: x,
            y: 0.08,
            text: labelText,
            showarrow: false,
            bgcolor: 'white',
            bordercolor: 'black',
            borderwidth: 1,
            borderpad: 2,
            opacity: 0.8
        });
        
        // 光强分布图标注
        intensityAnnotations.push({
            x: x,
            y: 3.8,
            text: labelText,
            showarrow: false,
            bgcolor: 'white',
            bordercolor: 'black',
            borderwidth: 1,
            borderpad: 2,
            opacity: 0.8
        });
    }
    
    // 添加中央明纹参考线
    Plotly.relayout(stripePlotElement, {
        shapes: [{
            type: 'line',
            x0: 0,
            x1: 0,
            y0: 0,
            y1: 0.1,
            line: {
                color: 'red',
                width: 2,
                dash: 'dash'
            }
        }],
        annotations: stripeAnnotations
    });
    
    Plotly.relayout(intensityPlotElement, {
        shapes: [{
            type: 'line',
            x0: 0,
            x1: 0,
            y0: -0.1,
            y1: 4.1,
            line: {
                color: 'red',
                width: 2,
                dash: 'dash'
            }
        }],
        annotations: intensityAnnotations
    });
}

// 更新参数显示
function updateParameterDisplay(d, L, wavelength, bandwidth, delta_x, monochromaticity) {
    const paramsText = `
当前参数：

双缝间距: ${(d * 1e3).toFixed(1)} mm
缝屏距离: ${L.toFixed(1)} m
入射光波长: ${(wavelength * 1e9).toFixed(0)} nm
带宽: ${(bandwidth * 1e9).toFixed(0)} nm

计算结果：
条纹间距△x: ${(delta_x * 1e3).toFixed(3)} mm
光源单色性: ${monochromaticity.toFixed(6)}

参数说明：
• 带宽表示光源波长的分布范围
• 0表示理想单色光（单一波长）
• 带宽越大，干涉条纹越模糊
• 单色性=带宽/波长，值越小表示光源纯度越高
    `;
    
    document.getElementById('params-text').textContent = paramsText;
}

// 页面加载完成后初始化应用
window.addEventListener('DOMContentLoaded', initializeApp);
