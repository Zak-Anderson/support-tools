const request = require('request');
const moment = require('moment');
require("moment-duration-format");

const hour = 1000 * 60 * 60
const day = hour * 24
const timeframe_windowsize = hour * 12 //TODO test with a full day
const timeframe_to = Date.now()
const granularity = hour * 12

// Check CLI
if (process.argv.length != 5) {
    console.error("Usage: node report.js <KUBERNETES_CLUSTER_NAME> <INSTANA_API_URL> <INSTANA_API_TOKEN>")
    return
}
const k8s_cluster = process.argv[2]
const api_url = process.argv[3]
const api_token = process.argv[4]


function functionRequestReport(groupBy, groupByLabel, metrics) {
    var body = {
        "timeFrame": {
            "to": timeframe_to,
            "windowSize": timeframe_windowsize
        },
        "type": "docker",
        "tagFilterExpression": {
            "type": "TAG_FILTER",
            "name": "kubernetes.cluster.name",
            "value": k8s_cluster,
            "operator": "EQUALS"
        },
        "groupBy": [groupBy],
        "metrics": metrics,
        "pagination": {
            "retrievalSize": 200
        }
    }

    const options = {
        url: api_url + 'infrastructure-monitoring/explore/groups',
        headers: {
            'authorization': 'apiToken ' + api_token,
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    };

    request.post(options, function (error, response, body) {
        if (error) console.error('error:', error);
        if (response.statusCode != 200) {
            console.debug('SatusCode:', response && response.statusCode);
            return
        }
        var body = JSON.parse(body)
        if (!body.data.items) {
            console.error("Unexpected result: " + body)
            return
        }

        var report = "";
        report += 'Usage Report for Kubernetes cluster "' + k8s_cluster + '" with ' + body.data.items.length + ' ' + groupByLabel + "s. "
        report += "From: " + moment(timeframe_to - timeframe_windowsize).format('DD MMMM YYYY HH:mm:ss');
        report += " to: " + moment(timeframe_to).format('DD MMMM YYYY HH:mm:ss') + "\n";
        report += "Type,Group,Container,CPU Usage (Mean),CPU Usage (P95),CPU Usage (P99),CPU Usage (Max),Memory Usage (Mean),Memory Usage (P95),Memory Usage (P99),Memory Usage (Max)\n"
        body.data.items.forEach(item => {
            report += groupByLabel + "," + item.tags[groupBy] + "," + item.count + ","
            report += metricStringPercent(item.metrics, "cpu.total_usage.MEAN." + timeframe_windowsize) + ","
            report += metricStringPercent(item.metrics, "cpu.total_usage.P95." + timeframe_windowsize) + ","
            report += metricStringPercent(item.metrics, "cpu.total_usage.P99." + timeframe_windowsize) + ","
            report += metricStringPercent(item.metrics, "cpu.total_usage.MAX." + timeframe_windowsize) + ","
            report += metricStringByte(item.metrics, "memory.usage.MEAN." + timeframe_windowsize) + ","
            report += metricStringByte(item.metrics, "memory.usage.P95." + timeframe_windowsize) + ","
            report += metricStringByte(item.metrics, "memory.usage.P99." + timeframe_windowsize) + ","
            report += metricStringByte(item.metrics, "memory.usage.MAX." + timeframe_windowsize)
            report += "\n"
        });
        console.log(report)
    });
}

var metricsSpec = createMetrics(
    { granularity: granularity, metric: "cpu.total_usage", aggregations: ["MEAN", "P95", "P99", "MAX"] },
    { granularity: granularity, metric: "memory.usage", aggregations: ["MEAN", "P95", "P99", "MAX"] }
)
functionRequestReport("kubernetes.namespace.name", "Namespace", metricsSpec)
functionRequestReport("kubernetes.pod.label", "Pod Label", metricsSpec)

function metricStringPercent(metrics, metricKey, label) {
    if (metrics[metricKey]) { // TODO for each metric not just [0][1]
        return (metrics[metricKey][0][1] * 100).toFixed(2) + "%";
    }
}

function metricStringByte(metrics, metricKey, label) {
    if (metrics[metricKey]) { // TODO for each metric not just [0][1]
        return (metrics[metricKey][0][1] / 1024 / 1024).toFixed(2) + "MB";
    }
    // detailed report:
    // if (metrics[metricKey]) {
    //     metrics[metricKey].forEach(metric => {
    //         console.log(" ", moment(metric[0]).format('DD MMMM YYYY HH:mm:ss'), label, (metric[1] * 100).toFixed(2), "%");
    //     })
    // }
}

function createMetrics(...specs) {
    var result = [];
    specs.forEach(spec => {
        spec.aggregations.forEach(aggregation => {
            result.unshift({ "metric": spec.metric, "aggregation": aggregation, "granularity": spec.granularity })
        })
    });
   return result;
}