# Provides a CATMAID development environment

# required to prevent virtualbox trying to start several servers
# on the same interface
# https://github.com/hashicorp/vagrant/issues/8878#issuecomment-345112810

class VagrantPlugins::ProviderVirtualBox::Action::Network
  def dhcp_server_matches_config?(dhcp_server, config)
    true
  end
end

Vagrant.configure("2") do |config|
  # also consider bento/ubuntu-* boxes
  config.vm.box = "ubuntu/focal64"

  if ENV["CATMAID_VM_DISK"]
    # https://askubuntu.com/a/1209925/439260
    unless Vagrant.has_plugin?("vagrant-disksize")
      raise Vagrant::Errors::VagrantError.new, "vagrant-disksize plugin is missing. Install it using 'vagrant plugin install vagrant-disksize' and rerun 'vagrant up'"
    end

    config.disksize.size = ENV["CATMAID_VM_DISK"]

    # When using bento/ubuntu-18.04 box,
    # needed to resize partitions, physical volumes, logical volumes.
    # This breaks in ubuntu/bionic64 and more recent bento/ubuntu boxes.
    # However, it also may not be necessary.
    # See discussion and related PR:
    # https://github.com/sprotheroe/vagrant-disksize/issues/37
    # config.vm.provision "shell", inline: <<-SHELL
    #   parted /dev/sda resizepart 1 100%
    #   pvresize /dev/sda1
    #   lvresize -rl +100%FREE /dev/mapper/vagrant--vg-root
    # SHELL
  end

  config.vm.provider "virtualbox" do |v|
    memory = ENV["CATMAID_VM_RAM_MB"] ? ENV["CATMAID_VM_RAM_MB"].to_i : 2048
    v.memory = memory
    cpus = ENV["CATMAID_VM_CPUS"] ? ENV["CATMAID_VM_CPUS"].to_i : 2
    v.cpus = cpus
  end

  # source directory
  config.vm.synced_folder "./", "/CATMAID"

  config.vm.hostname = "catmaid-vm"
  config.vm.define "catmaid-vm"

  # django dev server
  config.vm.network "forwarded_port", guest: 8888, host: 8888, host_ip: "127.0.0.1"
  # HTML sphinx-docs with `make serve`
  config.vm.network "forwarded_port", guest: 8889, host: 8889, host_ip: "127.0.0.1"
  # postgreSQL
  config.vm.network "forwarded_port", guest: 5555, host: 5555, host_ip: "127.0.0.1"

  config.vm.network "private_network", type: "dhcp"

  config.vm.provision :shell, path: "scripts/vagrant/root.sh"
  config.vm.provision :shell, privileged: false, path: "scripts/vagrant/user.sh"

  begin
    tz_name = `timedatectl | grep "Time zone" | awk '{print $3}'`.strip
    config.vm.provision :shell, privileged: false, :inline => "echo \"#{tz_name}\" > ~/timezone"
  rescue SystemCallError
    puts "POSIX shell not available, using default server timezone"
  end
end
