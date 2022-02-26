Table of Content:
* [1. Setup](#1-setup)
  * [1.1. Setup Clickhouse](#11-setup-clickhouse)
  * [1.2. Configure](#12-configure)
  * [1.3. Prepare manifest](#13-prepare-manifest)
  * [1.4. Setup pipy repo](#14-setup-pipy-repo)
  * [1.5. Deploy springboot apps](#15-deploy-springboot-apps)
  * [1.6. Deploy bookinfo apps](#16-deploy-bookinfo-apps)
* [2. Operating](#2-operating)
  * [2.1. Canary](#21-canary)
    * [2.1.1. SpringBoot](#211-springboot)
    * [2.1.2. Istio bookinfo](#212-istio-bookinfo)
  * [2.2. Rate Limit](#22-rate-limit)
  * [2.3. Circuit breaker](#23-circuit-breaker)
  * [2.4. Black/White List & ACL](#24-blackwhite-list--acl)
  * [2.5. Logging](#25-logging)
  * [2.6. Tracing](#26-tracing)
  * [2.7. Metrics](#27-metrics)
* [3. More](#3-more)
  * [3.1. How to access Pipy Repo?](#31-how-to-access-pipy-repo)

## 1. Setup

### 1.1. Setup Clickhouse

Execute `docker-compose -f clickhouse.yaml -d` to run a clickhouse server.

```yaml
#clickhouse.yaml
version: "3"
services:
  server:
    container_name: clickhouse-server
    image: yandex/clickhouse-server:21.8.10
    user: clickhouse
    ports:
      - "8123:8123"
      - "9000:9000"
      - "9009:9009"
    ulimits:
      nproc: 65535
      nofile:
        soft: 262144
        hard: 262144

```

### 1.2. Configure

Update clickhouse address in [logger.json](scripts/springboot/config/logger.json).

### 1.3. Prepare manifest

Do kustomize build. Skip this if nothing change. First of all, make sure the `jq` cli installed.

```shell
kustomize build --load-restrictor LoadRestrictionsNone config/repo -o artifacts/pipy-repo.yaml
kustomize build --load-restrictor LoadRestrictionsNone config/springboot -o artifacts/springboot.yaml
kustomize build --load-restrictor LoadRestrictionsNone config/bookinfo -o artifacts/bookinfo.yaml
kustomize build --load-restrictor LoadRestrictionsNone config/dubbo -o artifacts/dubbo.yaml
```
### 1.4. Setup pipy repo

```shell
kubectl apply -f artifacts/pipy-repo.yaml
```

Make sure pipy-repo pod is up:

```shell
kubectl get po -n pipy
NAME                         READY   STATUS    RESTARTS   AGE
pipy-repo-85b756c885-zv5c9   1/1     Running   0          20s
```

**Init springboot codebase:**

```shell
pushd scripts/springboot
./init-repo.sh
popd
```

**Init bookinfo codebase:**

```shell
pushd scripts/bookinfo
./init-repo.sh
popd
```

### 1.5. Deploy springboot apps

```shell
kubectl apply -f artifacts/springboot.yaml
```

### 1.6. Deploy bookinfo apps

```shell
kubectl apply -f artifacts/bookinfo.yaml
```

## 2. Operating

### 2.1. Canary

Currently, match supports `header`, `method` and `path`. All of them supports regular expression. 

#### 2.1.1. SpringBoot

* Firefox: show rating
* Others: no rating

Config: [router.json](scripts/springboot/config/router.json)

#### 2.1.2. Istio bookinfo

* Firefox: show blacking rating
* Chrome: show red rating
* Others: no rating

Config: [router.json](scripts/bookinfo/config/router.json)

### 2.2. Rate Limit

Implemented in service provider side.

* SpringBoot Config: [throttle.json](scripts/springboot/config/inbound/throttle.json)
* Bookinfo Config: [throttle.json](scripts/bookinfo/config/inbound/throttle.json)

Sample: 

```json
{
  "services": {
    "samples-bookinfo-review": {
      "rateLimit": 10
    }
  }
}
```

Access review service via gateway and we use *wrk* to simulate requests, `wrk -c5 -t5 -d10s --latency http://localhost:30010/bookinfo-reviews/reviews/2099a055-1e21-46ef-825e-9e0de93554ea`.

### 2.3. Circuit breaker

Implemented in service provider side.

* SpringBoot Config: [circuit-breaker.json](scripts/springboot/config/inbound/circuit-breaker.json)
* Bookinfo Config: [circuit-breaker.json](scripts/springboot/config/inbound/circuit-breaker.json)

```json
{
  "services": {
    "samples-bookinfo-details": {
      "enabled": false
    }
  },
  "response": {
    "head": {
      "status": 503
    },
    "message": "service unavailable!"
  }
}
```

Update `enabled` to `false` and execute `curl -is http://localhost:30010/bookinfo-details/details/2099a055-1e21-46ef-825e-9e0de93554ea`. You will get 503 response.

### 2.4. Black/White List & ACL

Implemented in service provider side.

* SpringBoot Config: [ban.json](scripts/springboot/config/inbound/ban.json)
* Bookinfo Config: [ban.json](scripts/bookinfo/config/inbound/ban.json)

```json
{
  "services": {
    "samples-bookinfo-ratings": {
      "white": [],
      "black": [
        "samples-api-gateway"
      ]
    }
  }
}
```

With config above, you should get 403 forbidden response if attempting to execute `curl -i http://localhost:30010/bookinfo-ratings/ratings/2099a055-1e21-46ef-825e-9e0de93554ea`.

Once remove `samples-api-gateway` from blacklist, will get 200 response with correct rating data.

### 2.5. Logging

Request and response loggged into Clickhouse.

### 2.6. Tracing

Implementing with OpenTelemetry. Logged together with req/res log, and stored in Clickhouse.

### 2.7. Metrics

Extract metrcis from Clickhouse and display via Grafana.

## 3. More

### 3.1. How to access Pipy Repo?

The pipy repo deployed in cluster is exposed as node port `30060` and it's light without repo GUI. 

With anther pipy running as repo client, you can access repo via GUI:

```shell
pipy http://localhost:30060 --admin-port=6060
```

Then, open `http://localhost:6060` in browser.