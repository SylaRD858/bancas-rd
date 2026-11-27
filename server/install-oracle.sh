#!/bin/bash
# BancaRD - instalador para Oracle Cloud (Oracle Linux 9 / Ubuntu). Solo ASCII.
# Uso: ADMIN_PASSWORD=xxxx bash install-oracle.sh
mkdir -p /var/www/status
exec > >(tee -a /var/www/status/progreso.txt /var/log/bancard-setup.log) 2>&1
echo "== BancaRD: inicio $(date) =="
if command -v firewall-cmd >/dev/null; then
  firewall-cmd --permanent --add-service=http --add-service=https; firewall-cmd --reload
  setsebool -P httpd_can_network_connect 1 || true
else
  iptables -I INPUT 5 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  iptables -I INPUT 5 -m state --state NEW -p tcp --dport 443 -j ACCEPT
fi
(cd /var/www/status && nohup python3 -m http.server 80 >/dev/null 2>&1 &)
echo "== swap =="
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
echo "== paquetes =="
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update && apt-get install -y git curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
  apt-get install -y iptables-persistent && netfilter-persistent save
else
  systemctl stop dnf-makecache.timer || true
  dnf -y install git --setopt=install_weak_deps=False
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - && dnf -y install nodejs --setopt=install_weak_deps=False
fi
echo "node: $(node -v)  git: $(git --version)"
echo "== aplicacion =="
useradd -r -m -d /opt/bancard -s /sbin/nologin bancard || true
[ -d /opt/bancard/app ] || sudo -u bancard git clone https://github.com/SylaRD858/bancas-rd /opt/bancard/app
sudo -u bancard mkdir -p /opt/bancard/data
cat > /etc/systemd/system/bancard.service <<UNIT
[Unit]
Description=BancaRD servidor seguro
After=network-online.target
[Service]
User=bancard
WorkingDirectory=/opt/bancard/app
Environment=PORT=8080 DATA_DIR=/opt/bancard/data TRUST_PROXY=1 ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
ExecStart=/usr/bin/node server/server.js
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
UNIT
chmod 600 /etc/systemd/system/bancard.service
cat > /usr/local/bin/bancard-update <<'UPD'
#!/bin/bash
cd /opt/bancard/app || exit 0
OLD=$(sudo -u bancard git rev-parse HEAD)
sudo -u bancard git pull -q --ff-only || exit 0
[ "$(sudo -u bancard git rev-parse HEAD)" != "$OLD" ] && systemctl restart bancard
UPD
chmod +x /usr/local/bin/bancard-update
printf '[Unit]\nDescription=Actualizar BancaRD\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/bancard-update\n' > /etc/systemd/system/bancard-update.service
printf '[Unit]\nDescription=Actualizar BancaRD cada 5 min\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/bancard-update.timer
systemctl daemon-reload
systemctl enable --now bancard bancard-update.timer
sleep 5; curl -s http://127.0.0.1:8080/api/ping; echo
echo "== HTTPS (Caddy) =="
IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me)
HOST=$(echo "$IP" | tr . -).sslip.io
ARCH=amd64; [ "$(uname -m)" = "aarch64" ] && ARCH=arm64
curl -fsSL -o /usr/local/bin/caddy "https://caddyserver.com/api/download?os=linux&arch=$ARCH" && chmod +x /usr/local/bin/caddy
command -v restorecon >/dev/null && restorecon -v /usr/local/bin/caddy
mkdir -p /etc/caddy /var/lib/caddy
printf '%s {\n  encode gzip\n  reverse_proxy 127.0.0.1:8080\n}\n' "$HOST" > /etc/caddy/Caddyfile
printf '[Unit]\nDescription=Caddy HTTPS\nAfter=network-online.target\n[Service]\nEnvironment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy\nExecStart=/usr/local/bin/caddy run --config /etc/caddy/Caddyfile\nRestart=always\n[Install]\nWantedBy=multi-user.target\n' > /etc/systemd/system/caddy.service
echo "== LISTO: https://$HOST =="
sleep 5
pkill -f "http.server 80" || true
systemctl daemon-reload
systemctl enable --now caddy
