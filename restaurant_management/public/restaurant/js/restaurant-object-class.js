RestaurantObject = class RestaurantObject {
    constructor(room, data) {
        Object.assign(this);
        this.data = data;
        this.identifier = data.identifier;
        this.drag = false;
        this.edit_form = null;
        this.room = room;
        this.obj = null;
        this.data_style_keys = ['x', 'y', 'z-index', 'width', 'height', 'background-color'];
        this.data_style = {};

        this.order_manage = null;
        this.process_manage = null;

        this.render();
        this.listener();
        RM.object(data.identifier, this);
    }

    listener() {
        frappe.realtime.on(this.data.name, (data) => {
            if (data.action === "Notifications") {
                this.update_notifications(data);
            } else {
                if (this.room.data.name === RM.current_room.data.name) {
                    if (data.action === UPDATE) {
                        this.set_data_style(null, null, data.data.data_style, data.data.color);
                        this.reset_data(data.data);

                        if (this.edit_form != null) {
                            this.edit_form.background_reload();
                        }

                        if (this.process_manage != null) {
                            this.process_manage.reload();
                        }
                    } else if (data.action === DELETE) {
                        this.remove();
                    }
                }
            }
        });
    }

    update_notifications(data) {
        this.data.current_user = data.current_user;
        this.data.orders_count = data.orders_count;
        this.set_orders_count();
    }

    remove() {
        this.obj.remove();
        let tables = Object.keys(this.room.tables);

        tables.forEach((table) => {
            if (this.room.tables[table].data.identifier === this.data.identifier) {
                delete this.room.tables[table];
                RM.sound_delete();
            }
        });
    }

    save_config(shape = false) {
        if (shape && this.data.type === 'Production Center') return;
        if (window.saving) return;

        CETI.api.call({
            model: "Restaurant Object",
            name: this.data.name,
            method: "set_style",
            args: {data: shape ? this.data.shape : JSON.stringify(this.data_style), shape: shape},
            always: () => {
                window.saving = false;
            },
        });
    }

    toggle_shape() {
        this.data.shape = this.data.shape === 'Round' ? 'Square' : 'Round';
        this.save_config(true);
    }

    css_style() {
        return this.obj == null ? null : this.obj.obj.style;
    }

    height() {
        return this.css_style() == null ? 0 : parseFloat(this.css_style().height);
    }

    width() {
        return this.css_style() == null ? 0 : parseFloat(this.css_style().width);
    }

    size() {
        return this.css_style() == null ? {width: 0, height: 0} : {
            height: parseFloat(this.css_style().height),
            width: parseFloat(this.css_style().width)
        };
    }

    absolute_width() {
        return parseFloat(this.data_style.x) + this.width();
    }

    absolute_height() {
        return parseFloat(this.data_style.y) + this.height();
    }

    unselect(force = false) {
        if ((!this.drag || force) && this.css_style() != null) {
            this.obj.css("z-index", this.data_style['z-index']).remove_class("selected");
        }
        setTimeout(() => {
            this.drag = false;
        }, 100);
    }

    refresh() {
        this.obj.self.setAttribute('style', this.data.css_style);
        this.show();
    }

    hide() {
        this.obj.hide();
    }

    show() {
        if (this.room.data.identifier === RM.current_room.data.identifier) {
            this.obj.show();
        }
    }

    set_data_style(x = null, y = null, data = null, color = null) {
        let ts = this.css_style();
        let origin_data_style = {};

        let update_data_style = (data) => {
            for (let k in this.data_style_keys) {
                if (!this.data_style_keys.hasOwnProperty(k)) continue;
                if (this.data_style_keys[k] in data) {
                    this.data_style[this.data_style_keys[k]] = data[this.data_style_keys[k]];
                }
            }
        }

        if (data != null) {
            try {
                origin_data_style = JSON.parse(data) == null ? {} : JSON.parse(data);
            } catch (e) {
            }
            update_data_style(origin_data_style);

        } else if (x != null && y != null) {
            this.data_style.x = x;
            this.data_style.y = y;

            ts.forEach((k) => {
                if (this.data_style_keys.includes(k)) this.data_style[k] = ts[k];
            });
        }
        this.data_style['background-color'] = color || this.data.color;
    }

    get_create_style() {
        let fix_prop = (k) => {
            let val = this.data_style[k];
            let fix = ['height', 'width'].includes(k) ? 100 : 0
            return (typeof val == "undefined" || val == null || val < 0) ? fix : val;
        }
        let styleText = "";

        this.data_style_keys.forEach((k) => {
            this.data_style[k] = fix_prop(k);
            if (k !== 'x' && k !== 'y') {
                let prop = this.data_style[k];
                styleText += k !== 'transform' ? (typeof prop != "undefined" ? `${k}:${prop};` : '') : '';
            }
        });

        return `${styleText} transform:translate(${this.data_style.x}px,${this.data_style.y}px)`;
    }

    render() {
        this.set_data_style(null, null, this.data.data_style);
        let class_type = this.data.type === 'Table' ? '' : 'p-center';
        let class_shape = this.data.shape === 'Round' && this.data.type === "Table" ? 'round-type' : '';

        this.obj = new JSHtml({
            caller: this,
            touched: false,
            tag: "div",
            properties: {
                class: `d-table ${class_type} ${class_shape}`,
                style: this.get_create_style()
            },
            content: this.template(),

        }).on("click", () => {
            this.select();
        });

        this.room.tables_container.append(this.obj.html());

        setTimeout(() => {
            this.draggable();
        }, 0);
    }

    draggable() {
        /*DRAG AND RESIZE USING INTERACT JS*/
        let self = this;
        let initDrag = () => {
            if (!this.is_selected()) return;
            self.drag = true;
            self.obj.add_class("drag");
        }
        let endDrag = () => {
            self.save_config();
            self.obj.remove_class("drag");
        }

        interact(this.obj.obj).resizable({
            edges: {
                left: ['.nw', '.sw', '.w'],
                top: ['.nw', '.ne', '.n'],
                bottom: ['.sw', '.se', '.s'],
                right: ['.se', '.ne', '.e'],
            },
            listeners: {
                start() {
                    initDrag()
                },
                move: (e) => drag.resize(e, self),
                end() {
                    endDrag()
                }
            },
            modifiers: [
                interact.modifiers.restrictSize({
                    min: {width: this.data.min_size, height: this.data.min_size}
                })
            ]
        })
            .draggable({
                listeners: {
                    start() {
                        initDrag()
                    },
                    move: (e) => drag.move(e, self),
                    end() {
                        endDrag()
                    }
                },
                inertia: true,
                autoScroll: true,
                modifiers: [
                    interact.modifiers.restrictRect({
                        restriction: 'parent',
                        endOnly: true
                    })
                ]
            });
    }

    template() {
        const block_style = !RM.can_open_order_manage(this) && this.data.type === "Table" ? RM.restrictions.color : "";
        const hide_class = this.data.orders_count <= 0 ? " hide" : "";

        this.indicator = new JSHtml({
            tag: "span",
            properties: {
                class: `order-count ${hide_class}`,
                style: `background-color: ${block_style}`
            },
            content: '<span class="fa fa-cutlery" style="font-size: 12px"/> {{text}}',
            text: this.data.orders_count
        });

        this.edit_button = new JSHtml({
            tag: "button",
            properties: {class: "btn d-table-btn btn-default btn-flat btn-sm"},
            content: '<span class="fa fa-trash"/>'
        }).on("click", () => {
            this.delete();
        }, DOUBLE_CLICK);

        this.delete_button = new JSHtml({
            tag: "button",
            properties: {class: "btn d-table-btn btn-default btn-flat btn-sm"},
            content: '<span class="fa fa-gear"/>'
        }).on("click", () => {
            this.edit();
        });

        this.shape_type_button = new JSHtml({
            tag: "button",
            properties: {class: "btn d-table-btn btn-default btn-flat btn-sm shape-button"},
            content: `<span class="fa fa-${this.data.shape === 'Round' ? 'square-o' : 'circle-o'}"/>`,
        }).on("click", () => {
            if (this.data.type === "Table") this.toggle_shape();
        });

        this.description = new JSHtml({
            tag: "span",
            properties: {class: "d-label"},
            content: "{{text}}",
            text: this.data.description
        });

        this.no_of_seats = new JSHtml({
            tag: "span",
            properties: {class: "d-table-seats"},
            content: `<span class="fa fa-user" style="font-size: 14px"/> {{text}}`,
            text: this.data.no_of_seats
        });

        return `
        <div class="resize-handle-container">
            <div class="resize-handle c ne"/><div class="resize-handle c nw"/><div class="resize-handle c sw"/><div class="resize-handle c se"/>
		    <div class="resize-handle b v w"/> <div class="resize-handle b v e"/> <div class="resize-handle b h n"/> <div class="resize-handle b h s"/>
            ${this.indicator.html()}
            ${this.description.html()}
		</div>
		<div class="d-toll-box">
			<div class="option-button">
			    ${this.delete_button.html()}
				${this.edit_button.html()}
				${this.shape_type_button.html()}
			</div>
		</div>
		${this.no_of_seats.html()}`
    }

    select() {
        if (!RM.editing) {
            this.open_modal();
            return;
        }

        if (this.is_selected()) {
            this.unselect();
        } else {
            this.room.set_z_index();
            this.obj.css("z-index", parseInt(RM.max_z_index) + 1);
            this.obj.toggle_common('d-table', 'selected');
        }
    }

    set_z_index() {
        this.room.set_z_index();
        this.data_style['z-index'] = (parseInt(RM.max_z_index) + 1);
        this.obj.css("z-index", this.data_style['z-index']);
    }

    open_modal() {
        if (this.data.type === "Table") {
            if (!RM.can_open_order_manage(this)) {
                RM.notification("red", __("The table is assigned to another user, you can not open"));
                return;
            }
            let open = () => {
                setTimeout(() => {
                    if (this.order_manage == null) {
                        this.order_manage = new OrderManage({
                            table: this,
                            identifier: RM.OMName(this.data.name)
                        })
                    } else {
                        this.order_manage.show();
                    }

                    RM.object(this.order_manage.identifier, this.order_manage);
                }, 0);
            }

            if (RM.transfer_order != null
                && RM.transfer_order.order_manage.table_name !== this.data.name
            ) {
                CETI.api.call({
                    model: "Table Order",
                    name: RM.transfer_order.data.name,
                    method: "transfer",
                    args: {table: this.data.name, client: RM.client},
                    always: (r) => {
                        if (r.message) {
                            if (RM.transfer_order != null) {
                                RM.transfer_order.order_manage.clear_current_order();
                                RM.transfer_order = null;
                            }
                        }
                        RM.ready();
                    },
                    freeze: true
                });
            } else {
                RM.transfer_order = null;
                RM.ready();
                open();
            }
        } else if (this.data.type === "Production Center") {
            if (RM.transfer_order != null) {
                frappe.confirm(
                    `${__("You are transferring an Order, choose a table")}<br><br>
					<strong>${__("Do you want to cancel the transfer?")}</strong>`,
                    () => {
                        RM.transfer_order = null;
                        RM.ready();
                        this.open_modal();
                    }
                );
                return;
            }

            setTimeout(() => {
                if (this.process_manage == null) {
                    this.process_manage = new ProcessManage({
                        name: this.data.name,
                        table: this,
                        identifier: RM.PMName(this.data.name)
                    });
                } else {
                    this.process_manage.show();
                }

                RM.current_process_manage = this.process_manage;
                RM.object(this.process_manage.identifier, this.process_manage);
            }, 0);
        }
    }

    is_selected() {
        return this.obj == null ? false : this.obj.obj == null ? false : this.obj.has_class("selected");
    }

    get_z_index() {
        return parseInt(this.data_style['z-index']);
    }

    delete() {
        RM.working("Deleting Object");
        CETI.api.call({
            model: "Restaurant Object",
            name: this.data.name,
            method: "_delete",
            always: () => {
                RM.ready();
            },
            freeze: true
        });
    }

    edit() {
        if (this.edit_form == null) {
            this.edit_form = new CETIForm({
                doctype: "Restaurant Object",
                docname: this.data.name,
                form_name: this.data.type === "Table" ? "restaurant-table" : "restaurant-production-center",
                call_back: () => {
                    this.edit_form.hide();
                },
                title: __(`Update ${this.data.type}`),
                field_properties: {
                    type: {read_only: true},
                    room: {read_only: true}
                }
            });
        } else {
            this.edit_form.show();
        }
    }

    reset_data(data) {
        this.data = data;
        this.obj.prop("style", this.get_create_style());
        this.obj.remove_class("round-type").add_class(this.data.shape === 'Round' && this.data.type === "Table" ? 'round-type' : '');
        this.shape_type_button.val(
            `<span class="fa fa-${this.data.shape === 'Round' ? 'square-o' : 'circle-o'}"/>`
        )
        this.description.val(this.data.description);
        this.no_of_seats.val(this.data.no_of_seats);
    }

    set_orders_count() {
        this.indicator.val(this.data.orders_count);

        if (this.data.orders_count > 0) {
            this.indicator.remove_class("hide");

            if (this.data.type === "Table") {
                this.indicator.css("background-color", RM.can_open_order_manage(this) ? '' : RM.restrictions.color);
            }
        } else {
            this.indicator.add_class("hide");
        }
    }
}