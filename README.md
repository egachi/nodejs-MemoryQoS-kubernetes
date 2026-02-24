## Kubernetes manifest used

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nodejs-oom-deployment
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nodejs-oom
  template:
    metadata:
      labels:
        app: nodejs-oom
    spec:
      containers:
        - name: nodejs-oom
          image: nodejs-oom-kubernetes:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 3000
          resources:
            requests:
              memory: "1Gi" # Solicitud de memoria
            limits:
              memory: "4Gi" # Límite (memory.max)
      imagePullSecrets:
        - name: regcred


```

## Steps to reproduce

1. Watch selected memory stat metrics every 3 seconds:

```
watch -n 3 'POD=$(kubectl get pod -l app=nodejs-oom -o name | head -1) && \
echo "=== USAGE ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.current | \
  awk "{printf \"current: %.3f GiB / 5.000 GiB (%.1f%%)\n\", \$1/1073741824, \$1/5368709120*100}" && \
echo "" && \
echo "=== SWAP ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.current | \
  awk "{printf \"swap used: %.3f GiB\n\", \$1/1073741824}" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.max | \
  awk "{if(\$1==\"max\") print \"swap max: max (unlimited)\"; else printf \"swap max: %.3f GiB\n\", \$1/1073741824}" && \
echo "" && \
echo "=== BREAKDOWN ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.stat | \
  grep -E "^anon |^file |^shmem |^inactive_anon |^active_anon |^inactive_file |^active_file |^slab_reclaimable |^swapcached |^zswap |^zswapped " | \
  awk "{printf \"  %-20s %10.2f MiB\n\", \$1, \$2/1048576}" && \
echo "" && \
echo "=== EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.events && \
echo "" && \
echo "=== SWAP EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.events 2>/dev/null || echo "  no swap events file" && \
echo "" && \
echo "=== MEMORY.HIGH ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.high'
```

2. How to reproduce the issue:

```
kubectl port-forward deployment/nodejs-oom-deployment 3000:3000 &
```

```
curl http://localhost:3000/start-all
```

- If you need to restart the port-forward if there are pod restart, then you need to kill the process:

```
pkill -f "port-forward"
```

# PODS
nodejs-oom-deployment-6c4fbfc46-5ccmb  →  ip-10-1-2-245.ec2.internal  →  NoMemoryQoSNoSwap
nodejs-oom-deployment-6c4fbfc46-5nhp8  →  ip-10-1-1-183.ec2.internal  →  MemoryQoSNoSwap
nodejs-oom-deployment-6c4fbfc46-tf2k7  →  ip-10-1-1-243.ec2.internal  →  MemoryQoSAndSwap


# TEST 1

- Command:

watch -n 3 'POD=pod/nodejs-oom-deployment-6c4fbfc46-5ccmb && \
echo "=== USAGE ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.current | \
  awk "{printf \"current: %.3f GiB / 5.000 GiB (%.1f%%)\n\", \$1/1073741824, \$1/5368709120*100}" && \
echo "" && \
echo "=== SWAP ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.current | \
  awk "{printf \"swap used: %.3f GiB\n\", \$1/1073741824}" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.max | \
  awk "{if(\$1==\"max\") print \"swap max: max (unlimited)\"; else printf \"swap max: %.3f GiB\n\", \$1/1073741824}" && \
echo "" && \
echo "=== BREAKDOWN ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.stat | \
  grep -E "^anon |^file |^shmem |^inactive_anon |^active_anon |^inactive_file |^active_file |^slab_reclaimable |^swapcached |^zswap |^zswapped " | \
  awk "{printf \"  %-20s %10.2f MiB\n\", \$1, \$2/1048576}" && \
echo "" && \
echo "=== EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.events && \
echo "" && \
echo "=== SWAP EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.events 2>/dev/null || echo "  no swap events file" && \
echo "" && \
echo "=== MEMORY.HIGH ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.high'

- Starting pod with no memoryQoS used and no swap.

kubectl port-forward pod/nodejs-oom-deployment-6c4fbfc46-5ccmb 3000:3000 &

=== USAGE ===
current: 0.010 GiB / 5.000 GiB (0.2%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                       9.11 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon              9.09 MiB
  active_anon                0.01 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           0.48 MiB

=== EVENTS ===
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
max


- After triggering the curl request curl http://localhost:3000/start-all -v

=== USAGE ===
current: 3.071 GiB / 5.000 GiB (61.4%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                    3126.56 MiB
  file                     250.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon           3126.54 MiB
  active_anon                0.01 MiB
  inactive_file              0.00 MiB
  active_file              250.00 MiB
  slab_reclaimable           5.63 MiB

=== EVENTS ===
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
max
- When reaching memory limit in nodejs defaults (3.998 GiB)

memoy-oom git:(master) ✗ k get pod nodejs-oom-deployment-6c4fbfc46-5ccmb -w
NAME                                    READY   STATUS    RESTARTS        AGE
nodejs-oom-deployment-6c4fbfc46-5ccmb   1/1     Running   1 (2m43s ago)   13m
nodejs-oom-deployment-6c4fbfc46-5ccmb   0/1     OOMKilled   1 (3m30s ago)   13m

# TEST 2

- Applying MemoryQoS, by default enabled in EKS 1.34

  kubelet:
    config:
      clusterDNS:
      - 172.20.0.10
      featureGates:
        MemoryQoS: true
      memoryThrottlingFactor: 0.9

memory.high = request + (limit - request) × factor
memory.high = 1 GiB + 3 GiB × 0.9 = 1 + 2.7 = 3.7 GiB (3,972,841,472 bytes)

That means that at 3.7Gib kernel will reclaim the page file 

- Command:

watch -n 3 'POD=pod/nodejs-oom-deployment-6c4fbfc46-5nhp8 && \
echo "=== USAGE ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.current | \
  awk "{printf \"current: %.3f GiB / 5.000 GiB (%.1f%%)\n\", \$1/1073741824, \$1/5368709120*100}" && \
echo "" && \
echo "=== SWAP ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.current | \
  awk "{printf \"swap used: %.3f GiB\n\", \$1/1073741824}" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.max | \
  awk "{if(\$1==\"max\") print \"swap max: max (unlimited)\"; else printf \"swap max: %.3f GiB\n\", \$1/1073741824}" && \
echo "" && \
echo "=== BREAKDOWN ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.stat | \
  grep -E "^anon |^file |^shmem |^inactive_anon |^active_anon |^inactive_file |^active_file |^slab_reclaimable |^swapcached |^zswap |^zswapped " | \
  awk "{printf \"  %-20s %10.2f MiB\n\", \$1, \$2/1048576}" && \
echo "" && \
echo "=== EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.events && \
echo "" && \
echo "=== SWAP EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.events 2>/dev/null || echo "  no swap events file" && \
echo "" && \
echo "=== MEMORY.HIGH ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.high'

- Starting pod with no memoryQoS used and no swap.

kubectl port-forward pod/nodejs-oom-deployment-6c4fbfc46-5nhp8 3000:3000 &

- When starting the pod:


=== USAGE ===
current: 0.011 GiB / 5.000 GiB (0.2%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                       9.24 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon              9.22 MiB
  active_anon                0.00 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           0.48 MiB

=== EVENTS ===
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
3972841472

- After triggering the curl request curl http://localhost:3000/start-all -v

=== USAGE ===
current: 2.977 GiB / 5.000 GiB (59.5%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                    3085.97 MiB
  file                     250.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon           3085.93 MiB
  active_anon                0.01 MiB
  inactive_file              0.00 MiB
  active_file              250.00 MiB
  slab_reclaimable           5.71 MiB

=== EVENTS ===
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
3972841472

- Kernel cleaning when reaching 3.7 GBs, at this point you will get page file cleaned but memory throttling...


=== USAGE ===
current: 3.686 GiB / 5.000 GiB (73.7%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                    3845.39 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon           3845.31 MiB
  active_anon                0.01 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           3.16 MiB

=== EVENTS ===
low 0
high 7293
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
3972841472


- But memory anon (inactive_anon) continues to grow, it is not cleaned by kernel. And we can see the high events continuously happening which will be cleaning the file cache.

=== USAGE ===
current: 3.803 GiB / 5.000 GiB (76.1%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 0.000 GiB

=== BREAKDOWN ===
  anon                    3885.74 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon           3885.70 MiB
  active_anon                0.00 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           3.15 MiB

=== EVENTS ===
low 0
high 91066
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
3972841472

- Until the nodejs crashes, throttling will affect application performance since there anon (inactive_anon) has not been cleaned by the app and it is affecting the entire memory set. File cache will be cleaned every x seconds and the app will try to allocate more memory.


# TEST 3

- Applying MemoryQoS reducing a little bit more the memory factor to be more aggresive with kernel memory claim and NodeSwap/LimitedSwap


kubelet:
  config:
    featureGates:
      MemoryQoS: true      # enables memory.high "proactive claim"
      NodeSwap: true        # enables swap "for anonymous memory"
    memoryThrottlingFactor: 0.5
    memorySwap:
      swapBehavior: LimitedSwap   # controlled swap per pod

memory.high = request + (limit - request) × factor
memory.high = 1 GiB + 3 GiB × 0.5 = 1 + 1.5 = 2.5 GiB


- Command:

watch -n 3 'POD=pod/nodejs-oom-deployment-6c4fbfc46-tf2k7 && \
echo "=== USAGE ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.current | \
  awk "{printf \"current: %.3f GiB / 5.000 GiB (%.1f%%)\n\", \$1/1073741824, \$1/5368709120*100}" && \
echo "" && \
echo "=== SWAP ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.current | \
  awk "{printf \"swap used: %.3f GiB\n\", \$1/1073741824}" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.max | \
  awk "{if(\$1==\"max\") print \"swap max: max (unlimited)\"; else printf \"swap max: %.3f GiB\n\", \$1/1073741824}" && \
echo "" && \
echo "=== BREAKDOWN ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.stat | \
  grep -E "^anon |^file |^shmem |^inactive_anon |^active_anon |^inactive_file |^active_file |^slab_reclaimable |^swapcached |^zswap |^zswapped " | \
  awk "{printf \"  %-20s %10.2f MiB\n\", \$1, \$2/1048576}" && \
echo "" && \
echo "=== EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.events && \
echo "" && \
echo "=== SWAP EVENTS ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.swap.events 2>/dev/null || echo "  no swap events file" && \
echo "" && \
echo "=== MEMORY.HIGH ===" && \
kubectl exec $POD -- cat /sys/fs/cgroup/memory.high'

kubectl port-forward pod/nodejs-oom-deployment-6c4fbfc46-tf2k7 3000:3000 &

- Starting pod:

=== USAGE ===
current: 0.011 GiB / 5.000 GiB (0.2%)

=== SWAP ===
swap used: 0.000 GiB
swap max: 1.025 GiB

=== BREAKDOWN ===
  anon                       9.45 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 0.00 MiB
  inactive_anon              9.43 MiB
  active_anon                0.01 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           0.48 MiB

=== EVENTS ===
low 0
high 0
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 0
fail 0

=== MEMORY.HIGH ===
2684354560

- Swap also will start at 2.5 Gib when reaching the memory.high. In this case, kernel will clean file cache but can't release anon memory, then it will start moving that to swap increasing the high events, but swap will be limited as well. The anno

=== USAGE ===
current: 2.494 GiB / 5.000 GiB (49.9%)

=== SWAP ===
swap used: 0.612 GiB
swap max: 1.025 GiB

=== BREAKDOWN ===
  anon                    2337.25 MiB
  file                     204.97 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 3.57 MiB
  inactive_anon           2306.44 MiB
  active_anon               34.37 MiB
  inactive_file             83.03 MiB
  active_file              121.94 MiB
  slab_reclaimable           5.71 MiB

=== EVENTS ===
low 0
high 8240
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 382
fail 382

=== MEMORY.HIGH ===
2684354560

- Swap max is reached, and swap fails will be increased and anon will continue to grow until reaches OOM at nodejs app. As well the memory throttling will affect nodejs app performance to allocate more memory needed.

=== USAGE ===
current: 2.570 GiB / 5.000 GiB (51.4%)

=== SWAP ===
swap used: 1.025 GiB
swap max: 1.025 GiB

=== BREAKDOWN ===
  anon                    2619.50 MiB
  file                       0.00 MiB
  shmem                      0.00 MiB
  zswap                      0.00 MiB
  zswapped                   0.00 MiB
  swapcached                 3.57 MiB
  inactive_anon           2588.68 MiB
  active_anon               34.37 MiB
  inactive_file              0.00 MiB
  active_file                0.00 MiB
  slab_reclaimable           3.16 MiB

=== EVENTS ===
low 0
high 86378
max 0
oom 0
oom_kill 0
oom_group_kill 0

=== SWAP EVENTS ===
high 0
max 382
fail 382

=== MEMORY.HIGH ===
2684354560


sh-5.2$ sudo dmesg -w | grep -iE "oom|killed|memory|cgroup"
[    0.000000] DMI: Memory slots populated: 2/2
[    0.011961] ACPI: Reserving FACP table memory at [mem 0xfc00a150-0xfc00a243]
[    0.011962] ACPI: Reserving DSDT table memory at [mem 0xfc001000-0xfc009a78]
[    0.011963] ACPI: Reserving FACS table memory at [mem 0xfc00a050-0xfc00a08f]
[    0.011963] ACPI: Reserving FACS table memory at [mem 0xfc00a050-0xfc00a08f]
[    0.011964] ACPI: Reserving SSDT table memory at [mem 0xfc009a80-0xfc009ab2]
[    0.011964] ACPI: Reserving SSDT table memory at [mem 0xfc009ac0-0xfc009af0]
[    0.011965] ACPI: Reserving APIC table memory at [mem 0xfc009b00-0xfc009bd7]
[    0.011965] ACPI: Reserving HPET table memory at [mem 0xfc009fe0-0xfc00a017]
[    0.011966] ACPI: Reserving WAET table memory at [mem 0xfc00a020-0xfc00a047]
[    0.012415] Early memory node ranges
[    0.020117] PM: hibernation: Registered nosave memory: [mem 0x00000000-0x00000fff]
[    0.020118] PM: hibernation: Registered nosave memory: [mem 0x0009e000-0x000fffff]
[    0.020119] PM: hibernation: Registered nosave memory: [mem 0xf0000000-0xffffffff]
[    0.158183] Freeing SMP alternatives memory: 36K
[    0.162976] Memory: 32828264K/33554036K available (16384K kernel code, 9439K rwdata, 11324K rodata, 3732K init, 6492K bss, 718188K reserved, 0K cma-reserved)
[    0.162976] x86/mm: Memory block size: 128MB
[    0.239217] Freeing initrd memory: 20400K
[    0.280451] Freeing unused decrypted memory: 2028K
[    0.282019] Freeing unused kernel image (initmem) memory: 3732K
[    0.284798] Freeing unused kernel image (rodata/data gap) memory: 964K
[    1.799314] SELinux:  policy capability cgroup_seclabel=1
[    2.104412] systemd[1]: Relabelled /dev, /dev/shm, /run, /sys/fs/cgroup in 18.862ms.
[    2.505713] zram_generator::config[1809]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[    3.463229] zram_generator::config[2947]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   52.123269] zram_generator::config[5126]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   62.741766] zram_generator::config[5637]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   65.023735] zram_generator::config[5664]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   65.343030] zram_generator::config[5705]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   65.810023] zram_generator::config[5753]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[   68.002715] zram_generator::config[5782]: zram0: system has too much memory (32092MB), limit is 800MB, ignoring.
[ 2993.661240] Thread-2 invoked oom-killer: gfp_mask=0xcc0(GFP_KERNEL), order=0, oom_score_adj=969
[ 2993.664084]  oom_kill_process+0xfc/0x210
[ 2993.664086]  out_of_memory+0xee/0x320
[ 2993.664091]  mem_cgroup_out_of_memory+0x12c/0x150
[ 2993.664102]  __mem_cgroup_charge+0x29/0x80
[ 2993.664150] memory: usage 4194304kB, limit 4194304kB, failcnt 1273284
[ 2993.708130] Memory cgroup stats for /kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod94eb36cd_29e1_478b_b365_4cb5dfc7d6fb.slice:
[ 2993.772930] Tasks state (memory values in pages):
[ 2993.774206] [  pid  ]   uid  tgid total_vm      rss rss_anon rss_file rss_shmem pgtables_bytes swapents oom_score_adj name
[ 2993.782678] oom-kill:constraint=CONSTRAINT_MEMCG,nodemask=(null),cpuset=cri-containerd-46b3e0a4df44b752b841aecca454e6e78995d567912a84950390bae6f6777a63.scope,mems_allowed=0,oom_memcg=/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod94eb36cd_29e1_478b_b365_4cb5dfc7d6fb.slice,task_memcg=/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod94eb36cd_29e1_478b_b365_4cb5dfc7d6fb.slice/cri-containerd-46b3e0a4df44b752b841aecca454e6e78995d567912a84950390bae6f6777a63.scope,task=node,pid=22609,uid=0
[ 2993.794008] Memory cgroup out of memory: Killed process 22609 (node) total-vm:9923620kB, anon-rss:4116684kB, file-rss:23132kB, shmem-rss:0kB, UID:0 pgtables:10964kB oom_score_adj:969
[ 2993.798222] Tasks in /kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod94eb36cd_29e1_478b_b365_4cb5dfc7d6fb.slice/cri-containerd-46b3e0a4df44b752b841aecca454e6e78995d567912a84950390bae6f6777a63.scope are going to be killed due to memory.oom.group set
[ 2993.804150] Memory cgroup out of memory: Killed process 22609 (node) total-vm:9923620kB, anon-rss:4116684kB, file-rss:23132kB, shmem-rss:0kB, UID:0 pgtables:10964kB oom_score_adj:969



Conclusion about this test:
- Swap pages = ONLY copy of that memory, but since it is a copy we can't clean it.

There is no Linux mechanism to just drop swap pages like you can drop page cache with drop_caches. Swap pages are the only copy of that data, if you discard them, the process would crash when it tries to access those pages.

The only practical options are killing the process entirely or recreating the swap file, but even recreating swap requires swapoff to move pages back to RAM first, there's no way around it since the kernel must preserve those pages as they're the only copy of that data.

- File cache = copy exists on disk (can drop safely)
- Current workaround of the customer (now)
  sync && echo 3 > /proc/sys/vm/drop_caches    <= clears file cache but not anon memory.
- Better workaround:
   kubectl rollout restart deployment <app>  <= will clear everything
                                                   file cache + swap + anon
                                                   pod starts fresh with 0 memory

FINAL CONCLUSION:
- Application has a memory leak and will end in OOM when reaching all the limits even implementing MemoryQoS or NodeSwap, it will mitigate temporary but it will continue growing until reaching OOM.


# OTHER COMMANDS:

kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.nodeName}{"\n"}{end}' \
| while read pod node; do
  label=$(kubectl get node "$node" -o jsonpath='{.metadata.labels.memory}')
  echo "$pod  →  $node  →  $label"
done